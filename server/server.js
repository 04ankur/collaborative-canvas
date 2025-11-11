const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const DrawingState = require('./drawing-state');
const RoomManager = require('./rooms'); // Make sure this is 'rooms.js'

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const state = new DrawingState();
const userManager = new RoomManager();

const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// MODIFIED CONNECTION HANDLER
io.on('connection', (socket) => {
  // Get the name from the query sent by the client
  const userName = socket.handshake.query.name || `User-${socket.id.substring(0, 4)}`;
  
  console.log(`A user connected: ${userName} (${socket.id})`);
  
  // Pass the name to the user manager
  const userColor = userManager.addUser(socket.id, userName);

  // Send initial state to the new user
  socket.emit('init', {
    history: state.getHistory(),
    userId: socket.id,
    userColor: userColor,
    users: userManager.getUsers()
  });

  // Notify other users (this now includes the correct name)
  socket.broadcast.emit('user-joined', userManager.getUser(socket.id));

  // --- Drawing Events ---
  socket.on('draw-start', (data) => {
    socket.broadcast.emit('draw-start', { ...data, userId: socket.id });
  });

  socket.on('drawing', (data) => {
    socket.broadcast.emit('drawing', { ...data, userId: socket.id });
  });

  socket.on('draw-end', (operation) => {
    const opWithUser = { ...operation, userId: socket.id };
    state.addOperation(opWithUser);
    io.emit('global-draw-end', opWithUser);
  });

  // --- Cursor Events ---
  socket.on('cursor-move', (data) => {
    socket.broadcast.emit('cursor-move', { ...data, userId: socket.id });
  });

  // --- State Synchronization Events ---
  socket.on('undo-request', () => {
    const op = state.undo();
    if (op) {
      io.emit('global-undo');
    }
  });

  socket.on('redo-request', () => {
    const op = state.redo();
    if (op) {
      io.emit('global-redo', op);
    }
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userName} (${socket.id})`);
    userManager.removeUser(socket.id);
    io.emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});