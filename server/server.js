const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs'); // Added for persistence
const DrawingState = require('./drawing-state');
const RoomManager = require('./rooms');

// --- Persistence Setup ---
// FIX 1: Use Vercel's writable /tmp directory
const persistenceDir = path.join('/tmp', 'saved_drawings');
// ----------------------------------------------------

// Create persistence directory if it doesn't exist
// Vercel can write to /tmp
if (!fs.existsSync(persistenceDir)) {
    fs.mkdirSync(persistenceDir);
    console.log(`Created persistence directory: ${persistenceDir}`);
}

/**
 * Gets the save path for a room.
 * @param {string} roomName 
 * @returns {string}
 */
function getSavePath(roomName) {
    // Sanitize roomName to prevent directory traversal
    const safeName = path.basename(roomName) + '.json';
    return path.join(persistenceDir, safeName);
}

/**
 * Loads a room's history from a file.
 * @param {string} roomName 
 * @returns {object[]}
 */
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

/**
 * Saves a room's history to a file.
 * @param {string} roomName 
 * @param {object[]} history 
 */
function saveHistory(roomName, history) {
    const savePath = getSavePath(roomName);
    try {
        fs.writeFileSync(savePath, JSON.stringify(history), 'utf8');
    } catch (err) {
        console.error(`Error saving history for ${roomName}:`, err);
    }
}
// --- End Persistence Setup ---


const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- FIX 2: Use process.cwd() to build a Vercel-safe path ---
const clientPath = path.join(process.cwd(), 'client');
// ---------------------------------------------------------

app.use(express.static(clientPath));

// Store rooms in a Map
// K: roomName, V: { state: DrawingState, users: RoomManager }
const rooms = new Map();

/**
 * Gets or creates a room instance.
 * @param {string} roomName 
 * @returns {{state: DrawingState, users: RoomManager}}
 */
function getOrCreateRoom(roomName) {
    if (!rooms.has(roomName)) {
        console.log(`Creating new room: ${roomName}`);
        
        // Load saved history *before* creating the state
        const initialHistory = loadHistory(roomName); 
        
        rooms.set(roomName, {
            // Pass loaded history to the DrawingState
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
    // Get name and room from the client's query
    const { name: userName, room: roomName } = socket.handshake.query;

    if (!roomName || !userName) {
        console.log("User tried to connect without name or room. Disconnecting.");
        socket.disconnect();
        return;
    }

    // Get the specific state and user manager for this room
    const { state, users } = getOrCreateRoom(roomName);
    
    // Put the socket into the requested room
    socket.join(roomName);
    
    console.log(`User ${userName} (${socket.id}) joined room: ${roomName}`);
    
    const userColor = users.addUser(socket.id, userName);

    // Send this room's history to the new user
    socket.emit('init', {
        history: state.getHistory(),
        userId: socket.id,
        userColor: userColor,
        users: users.getUsers()
    });

    // Notify *only this room* that a new user joined
    socket.broadcast.to(roomName).emit('user-joined', users.getUser(socket.id));

    // --- Drawing Events (Room-Specific) ---
    socket.on('draw-start', (data) => {
        socket.broadcast.to(roomName).emit('draw-start', { ...data, userId: socket.id });
    });

    socket.on('drawing', (data) => {
        socket.broadcast.to(roomName).emit('drawing', { ...data, userId: socket.id });
    });

    socket.on('draw-end', (operation) => {
        const opWithUser = { ...operation, userId: socket.id };
        state.addOperation(opWithUser);
        // Broadcast to everyone in this room (including sender)
        io.to(roomName).emit('global-draw-end', opWithUser);
        
        // Save history on change
        saveHistory(roomName, state.getHistory());
    });

    // --- Cursor Events (Room-Specific) ---
    socket.on('cursor-move', (data) => {
        socket.broadcast.to(roomName).emit('cursor-move', { ...data, userId: socket.id });
    });

    // --- State Sync (Room-Specific) ---
    socket.on('undo-request', () => {
        const op = state.undo();
        if (op) {
            io.to(roomName).emit('global-undo');
            // Save history on change
            saveHistory(roomName, state.getHistory());
        }
    });

    socket.on('redo-request', () => {
        const op = state.redo();
        if (op) {
            io.to(roomName).emit('global-redo', op);
            // Save history on change
            saveHistory(roomName, state.getHistoPry());
        }
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
        console.log(`User ${userName} (${socket.id}) left room: ${roomName}`);
        // Only run disconnect logic if user was in a room
        if (users) {
            users.removeUser(socket.id);
            // Notify *only this room* that a user left
            io.to(roomName).emit('user-left', socket.id);
            
            // Optional: Clean up empty rooms to save memory
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});