// peer.js
let is_origin = false;
let pcs = {}; // 상대 peer의 id와 RTCRemoteConnection을 매핑
let localStream = null; // 로컬 미디어 스트림을 저장할 변수
let receivedStream = null;
let constraints = {
    'video': {
        width: 640,
        height: 480
    },
    'audio': true
}

const socket = io.connect();
const videoElement = document.getElementById('video'); // html의 video 요소
//const localVideo = document.getElementById('localVideo'); // html의 localVideo 요소
//const remoteVideo = document.getElementById('remoteVideo'); // html의 remoteVideo 요소
const btnVideo = document.getElementById('toggleVideo'); // 비디오 토글 버튼
const btnAudio = document.getElementById('toggleAudio'); // 오디오 토글 버튼
const roomElement = document.getElementById('room'); // html의 방 이름 표시 요소

// 비디오 토글 버튼 이벤트 리스너
btnVideo.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        btnVideo.textContent = videoTrack.enabled ? '비디오 OFF' : '비디오 ON';
    }
});

// 오디오 토글 버튼 이벤트 리스너
btnAudio.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        btnAudio.textContent = audioTrack.enabled ? '오디오 OFF' : '오디오 ON';
    }
});

// 클라이언트가 서버와 연결되면 자동으로 'connect' 이벤트 호출
socket.on('connect', () => {
    console.log('Connected to signaling server:', socket.id);
    getLocalStream(); // localStream을 불러오고 join 이벤트를 emit

    socket.on('room_full', (room) => {
        alert(`The room ${room} is full. Failed to join.`);
        roomElement.textContent = "no room";
    });

    socket.on('room_joined', ({room, origin}) => {
        if (origin) {
            console.log(`You are the origin peer in ${room}`);
            is_origin = true;
            videoElement.srcObject = localStream;
        }
        roomElement.textContent = `joined in ${room}`;
    });

    // 새로운 피어가 접속했을 때
    socket.on('new_peer', async (peerId) => {
        let stream = receivedStream;
        if (is_origin) {
            stream = localStream;
        }
        let pc = createPeerConnection(socket, peerId, stream);
        pcs[peerId] = pc;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', {to: peerId, offer});
        console.log(`Offer sent to new peer ${peerId}`);
    });

    // offer를 받았을 때 처리
    socket.on('offer', async ({from, offer}) => {
        let pc = createPeerConnection(socket, from, null);
        pcs[from] = pc;
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {to: from, answer});
        console.log(`Answer sent to peer ${from}`);
    });

    // answer를 받았을 때 처리
    socket.on('answer', async ({from, answer}) => {
        let pc = pcs[from];
        await pc.setRemoteDescription(answer);
    });

    // candidate를 받았을 때 처리
    socket.on('candidate', async ({from, candidate}) => {
    try {
        let pc = pcs[from];
        if (!pc) return;
        await pc.addIceCandidate(candidate);
    } catch (e) {
        console.error('Error adding candidate:', e);
    }
    });

    // 피어가 연결을 끊었을 때 해당 피어의 RTCPeerConnection을 제거
    socket.on('peer_disconnect', (peerId) => {
        if (pcs[peerId]) {
            pcs[peerId].close();
            delete pcs[peerId];
        }
        //remoteVideo.srcObject = null;
    });
});

// 로컬 미디어 스트림을 가져온 후 join 이벤트를 emit하는 async 함수
async function getLocalStream() {
    // 브라우저로부터 미디어 스트림을 가져와 localVideo의 소스로 설정
    localStream = await navigator.mediaDevices.getUserMedia(constraints);

    // 방에 참여 요청
    socket.emit('join');
}

// RTCPeerConnection 생성 및 이벤트 핸들러를 설정하는 함수
function createPeerConnection(socket, remoteSocketId, stream) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // track을 받으면 해당 스트림을 remoteVideo의 소스로 설정
    // track을 통해 실시간으로 미디어 데이터를 수신 (WebRTC가 자동적으로 처리)
    pc.ontrack = (event) => {
        console.log(`Track received from ${remoteSocketId}`);
        receivedStream = event.streams[0];
        videoElement.srcObject = receivedStream;
    };

    // ICE candidate가 생성되면 비동기적으로 'candidate' 이벤트를 emit
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', {to: remoteSocketId, candidate: event.candidate});
        }
    };

    // Peer Connection의 ICE 상태가 변경될 때
    pc.oniceconnectionstatechange = () => {
        console.log('ICE state:', pc.iceConnectionState);
        // 연결이 성사되었을 때 peer_connected 이벤트를 emit
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            console.log('P2P connection completed');
            socket.emit('peer_connected', remoteSocketId);
        }
    }

    // 내 track을 Peer Connection에 추가
    // track을 추가하면 내 미디어 데이터를 실시간으로 전송 (WebRTC가 자동적으로 처리)
    if (stream) {
        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });
    }

    return pc;
}