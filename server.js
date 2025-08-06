// server.js
// import modules
const fs = require('fs');
const https = require('https');
const express = require('express');
const socketIO = require('socket.io');

const app = express();

// SSL 인증서 설정 (https를 사용하기 위한 권한)
const options = {
    key: fs.readFileSync(process.env.SSL_KEY_FILE || 'C:\\Windows\\System32\\key.pem'),
    cert: fs.readFileSync(process.env.SSL_CRT_FILE || 'C:\\Windows\\System32\\cert.pem'),
};

const PORT = 8080;
const server = https.createServer(options, app);
const io = socketIO(server);

app.use(express.static(__dirname)); // 디렉토리에 있는 정적 파일 제공

// 클라이언트가 접속하면 자동으로 'connection' 이벤트 발생
io.on('connection', socket => {
    console.log('[0] New client connected:', socket.id);

    socket.on('join', () => {
        const room = 'room1';
        const roomClients = io.sockets.adapter.rooms.get(room) || new Set(); // room에 속한 소켓 ID들의 집합

        // 방에 2명 이상 있다면 방 참여 거부
        if (roomClients.size >= 2) {
            socket.emit('room_full', room);
            console.log(`[0-2] Client ${socket.id} failed to join Room ${room}: room_full`);
            return;
        }

        socket.join(room);
        socket.emit('room_joined', room);
        console.log(`[0-1] ${socket.id} joined ${room}`);

        socket.to(room).emit('new_peer', socket.id); // 새 피어가 왔다고 알림

        // sdp(offer)를 전달
        socket.on('offer', ({to, offer}) => {
            io.to(to).emit('offer', {from: socket.id, offer});
            console.log(`[1] Offer sent from ${socket.id} to ${to}`);
        });

        // sdp(answer)를 전달
        socket.on('answer', ({to, answer}) => {
            io.to(to).emit('answer', {from: socket.id, answer});
            console.log(`[2] Answer sent from ${socket.id} to ${to}`);
        });

        // ICE candidate를 전달
        socket.on('candidate', ({to, candidate}) => {
            io.to(to).emit('candidate', {from: socket.id, candidate});
            console.log(`[1-1] Candidate sent from ${socket.id} to ${to}`);
        });

        // Peer Connection이 완료되면 로그 출력
        socket.on('peer_connected', peerId => {
            console.log(`[3] Peer ${peerId} connected to ${socket.id}`);
        });

        // 피어가 연결을 끊었을 때 나머지 피어에게 알림
        socket.on('disconnect', () => {
            console.log(`${socket.id} disconnected`);
            socket.to(room).emit('peer_disconnect');
        });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Signaling server running at ${PORT}`);
});
