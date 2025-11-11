const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const DrawingState = require('./drawing-state');
const RoomManager = require('./rooms');

// --- Persistence Setup (Simple Version) ---
const persistenceDir = path.join(__dirname, 'saved_drawings');
if (!fs.existsSync(persistenceDir)) {
    fs.mkdirSync(persistenceDir);
    console.log(`Created persistence directory: ${persistenceDir}`);
}

function getSavePath(roomName) {
    const safeName = path.basename(roomName) + '.json';
    return path.join(persistenceDir, safeName);
}

function loadHistory(roomName) {
    const savePath = getSavePath(roomName);
    if (fs.existsSync(savePath)) {
        try {
            const data = fs.readFileSync(savePath, 'utf8');
            console.log(`Loaded history for room: ${roomName}`);
            return JSON.parse(data);
        } catch (err) {
            console.error(`Error loading history for ${roomName}:`, err);
            return [];
        }
    }
    return [];
}

function saveHistory(roomName, history) {
    const savePath = getSavePath(roomName);
    try {
        fs.writeFileSync(savePath, JSON.stringify(history), 'utf8');
    } catch (err) {
        console.error(`Error saving history for ${roomName}:`, err);
    }
}
// --- End Persistence ---


const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Original, Simple Path (Works in Railway) ---
const clientPath = path.join(__dirname, '../client');

app.use(express.static(clientPath));

const rooms = new Map();

function getOrCreateRoom(roomName) {
    if (!rooms.has(roomName)) {
        console.log(`Creating new room: ${roomName}`);
        const initialHistory = loadHistory(roomName); 
        rooms.set(roomName, {
            state: new DrawingState(initialHistory), 
            users: new RoomManager()
        });
    }
    return rooms.get(roomName);
}

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
});


io.on('connection', (socket) => {
    const { name: userName, room: roomName } = socket.handshake.query;

    if (!roomName || !userName) {
        socket.disconnect();
        return;
    }

    const { state, users } = getOrCreateRoom(roomName);
    
    socket.join(roomName);
    console.log(`User ${userName} (${socket.id}) joined room: ${roomName}`);
    
    const userColor = users.addUser(socket.id, userName);

    socket.emit('init', {
        history: state.getHistory(),
        userId: socket.id,
        userColor: userColor,
        users: users.getUsers()
    });

    socket.broadcast.to(roomName).emit('user-joined', users.getUser(socket.id));

    // --- Drawing Events ---
    socket.on('draw-start', (data) => {
        socket.broadcast.to(roomName).emit('draw-start', { ...data, userId: socket.id });
    });

    socket.on('drawing', (data) => {
        socket.broadcast.to(roomName).emit('drawing', { ...data, userId: socket.id });
    });

    socket.on('draw-end', (operation) => {
        const opWithUser = { ...operation, userId: socket.id };
        state.addOperation(opWithUser);
        io.to(roomName).emit('global-draw-end', opWithUser);
        saveHistory(roomName, state.getHistory());
    });

    // --- Cursor Events ---
    socket.on('cursor-move', (data) => {
        socket.broadcast.to(roomName).emit('cursor-move', { ...data, userId: socket.id });
    });

    // --- State Sync ---
    socket.on('undo-request', () => {
        const op = state.undo();
        if (op) {
            io.to(roomName).emit('global-undo');
            saveHistory(roomName, state.getHistory());
        }
    });

    socket.on('redo-request', () => {
        const op = state.redo();
        if (op) {
            io.to(roomName).emit('global-redo', op);
            saveHistory(roomName, state.getHistory());
        }
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
        console.log(`User ${userName} (${socket.id}) left room: ${roomName}`);
        if (users) {
            users.removeUser(socket.id);
            io.to(roomName).emit('user-left', socket.id);
            if (users.getUsers().length === 0) {
                console.log(`Room ${roomName} is empty, removing from memory.`);
                rooms.delete(roomName);
            }
        }
    });

    // --- Performance Metrics ---
    socket.on('ping-from-client', () => {
        socket.emit('pong-from-server');
    });
});

// Railway will provide the $PORT variable
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});