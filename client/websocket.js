export class WebSocketClient {
    // MODIFIED CONSTRUCTOR
    constructor(url, userName, roomName) {
        // If url is null, Socket.IO auto-detects
        const socketUrl = url || undefined;
        
        // Send the user's name AND room in the connection query
        this.socket = io(socketUrl, {
            query: { 
                name: userName || 'Anonymous',
                room: roomName
            }
        });
        
        this.listeners = new Map();

        // Use 'onAny' to debug all incoming events
        this.socket.onAny((event, ...args) => {
            // console.log('RECV:', event, args); 
            if (this.listeners.has(event)) {
                this.listeners.get(event).forEach(callback => {
                    callback(...args);
                });
            }
        });

        this.socket.on('connect_error', (err) => {
            console.error('Connection Failed:', err.message);
        });
    }

    /**
     * Emits an event to the server.
     * @param {string} event - The name of the event.
     * @param {*} data - The data to send.
     */
    emit(event, data) {
        // console.log('EMIT:', event, data);
        this.socket.emit(event, data);
    }

    /**
     * Registers a callback for a specific event from the server.
     * @param {string} event - The name of the event.
     * @param {Function} callback - The function to call when the event is received.
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
}