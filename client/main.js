import { CanvasManager } from './canvas.js';
import { WebSocketClient } from './websocket.js';

// --- 1. Wait for DOM, then show modal ---
document.addEventListener('DOMContentLoaded', () => {
    const modalOverlay = document.getElementById('name-modal-overlay');
    const nameInput = document.getElementById('name-input');
    const joinBtn = document.getElementById('join-btn');
    const appContainer = document.querySelector('.app-container');

    // Show modal
    modalOverlay.style.display = 'flex';
    nameInput.focus();

    // Listen for join button click
    joinBtn.addEventListener('click', () => {
        const userName = nameInput.value.trim();
        if (userName) {
            // Hide modal, show app, and start
            modalOverlay.style.display = 'none';
            appContainer.style.visibility = 'visible';
            initializeApp(userName);
        }
    });

    // Allow pressing Enter to join
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
});


// --- 2. Main App Initialization ---
function initializeApp(userName) {
    // --- Initialize Modules ---
    // Pass the user's name to the websocket client
    const ws = new WebSocketClient('ws://' + window.location.host, userName);
    const canvas = new CanvasManager(
        document.getElementById('main-canvas'),
        document.getElementById('temp-canvas'),
        ws.emit.bind(ws)
    );

    // --- Cache DOM Elements ---
    const userListEl = document.getElementById('user-list');
    const colorPicker = document.getElementById('color-picker');
    const strokeWidthSlider = document.getElementById('stroke-width');
    const strokeValueEl = document.getElementById('stroke-value');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const toolSelect = document.getElementById('tool-select');

    // --- Local State ---
    let myUserId = null;
    let allUsers = new Map();

    // --- Bind Toolbar Event Listeners ---
    colorPicker.addEventListener('change', (e) => canvas.setColor(e.target.value));
    strokeWidthSlider.addEventListener('input', (e) => {
        const width = e.target.value;
        canvas.setStrokeWidth(width);
        strokeValueEl.textContent = width;
    });
    toolSelect.addEventListener('change', (e) => canvas.setTool(e.target.value));
    undoBtn.addEventListener('click', () => ws.emit('undo-request'));
    redoBtn.addEventListener('click', () => ws.emit('redo-request'));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (document.activeElement === nameInput) return; // Don't trigger if typing name
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                ws.emit('undo-request');
            } else if (e.key === 'y') {
                e.preventDefault();
                ws.emit('redo-request');
            }
        }
    });

    // --- Bind WebSocket Event Handlers ---
    ws.on('init', ({ history, userId, userColor, users }) => {
        myUserId = userId;
        allUsers = new Map(users.map(u => [u.id, u]));
        canvas.setLocalHistory(history);
        canvas.setMyId(userId);
        updateUserList();
    });

    ws.on('user-joined', (user) => {
        allUsers.set(user.id, user);
        updateUserList();
    });

    ws.on('user-left', (userId) => {
        allUsers.delete(userId);
        updateUserList();
        canvas.removeUserCursor(userId);
    });

    ws.on('draw-start', (data) => canvas.handleRemoteDrawStart(data));
    ws.on('drawing', (data) => canvas.handleRemoteDrawing(data));
    ws.on('global-draw-end', (operation) => canvas.handleGlobalDrawEnd(operation));

    ws.on('cursor-move', (data) => {
        const user = allUsers.get(data.userId);
        if (user) {
            canvas.updateUserCursor(data.userId, data.x, data.y, user.name, user.color);
        }
    });

    ws.on('global-undo', () => canvas.handleGlobalUndo());
    ws.on('global-redo', (operation) => canvas.handleGlobalRedo(operation));

    // --- Helper Function ---
    function updateUserList() {
        userListEl.innerHTML = ''; // Clear list
        allUsers.forEach(user => {
            const userEl = document.createElement('li');
            userEl.textContent = user.name;
            userEl.style.setProperty('--user-color', user.color);
            
            // This is how we mark *our* name in the list
            if (user.id === myUserId) {
                userEl.classList.add('current-user');
            }
            userListEl.appendChild(userEl);
        });
    }
}