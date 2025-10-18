const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-call', (data) => {
    const { roomId, username } = data;
    socket.data = { roomId, username };
    socket.join(roomId);
    console.log(`${username} (${socket.id}) joining room ${roomId}`);
    
    socket.to(roomId).emit('user-joined', { id: socket.id, username });
    io.to(roomId).emit('status-update', { type: 'user-joined', message: `${username} joined` });
  });

  socket.on('set-username', (data) => {
    socket.data.username = data.username;
  });

  socket.on('offer', (data) => {
    const { roomId, offer } = data;
    socket.to(roomId).emit('offer', { offer, sender: socket.id, senderName: socket.data.username });
    console.log(`Offer from ${socket.data.username} to room ${roomId}`);
  });

  socket.on('answer', (data) => {
    const { roomId, answer } = data;
    socket.to(roomId).emit('answer', { answer, sender: socket.id, senderName: socket.data.username });
    console.log(`Answer from ${socket.data.username} to room ${roomId}`);
  });

  socket.on('ice-candidate', (data) => {
    const { roomId, candidate } = data;
    console.log(`ICE from ${socket.data.username} to room ${roomId} (candidate: ${candidate.candidate?.substring(0, 20)}...)`);
    socket.to(roomId).emit('ice-candidate', candidate);
  });

  socket.on('status-update', (data) => {
    io.to(socket.data.roomId).emit('status-update', data);
  });

  socket.on('disconnect', () => {
    if (socket.data) {
      io.to(socket.data.roomId).emit('status-update', { type: 'user-left', message: `${socket.data.username} left` });
      console.log(`${socket.data.username} disconnected from room ${socket.data.roomId}`);
    }
  });
});

// Remove server.listen() on Vercel
// Instead, export the server instance
module.exports = server;
