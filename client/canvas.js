/**
 * Manages all HTML Canvas drawing logic for the two-canvas system.
 * - 'mainCanvas' (bottom layer) stores the permanent, committed history.
 * - 'tempCanvas' (top layer) stores live, in-progress drawings and cursors.
 */
export class CanvasManager {
    constructor(mainCanvasEl, tempCanvasEl, emit) {
        this.mainCanvas = mainCanvasEl;
        this.mainCtx = mainCanvasEl.getContext('2d');
        this.tempCanvas = tempCanvasEl;
        this.tempCtx = tempCanvasEl.getContext('2d');
        this.emit = emit; // Function to emit WebSocket events

        this.myUserId = null;
        this.isDrawing = false;
        
        // --- State ---
        this.currentStroke = null;      // Our own in-progress stroke
        this.remoteStrokes = new Map(); // Other users' in-progress strokes (K: userId, V: operation)
        this.remoteCursors = new Map(); // Other users' cursors (K: userId, V: {x, y, name, color})
        this.historyStack = [];
        this.redoStack = [];

        // --- Drawing Properties ---
        this.tool = 'brush';
        this.color = '#000000';
        this.strokeWidth = 5;

        this.resizeCanvases();
        this.initListeners();
    }

    /** Initialize all mouse and window listeners */
    initListeners() {
        window.addEventListener('resize', () => this.resizeCanvases());
        
        // Use tempCanvas for all mouse events
        this.tempCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.tempCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.tempCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.tempCanvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
    }

    /** Adjust canvas sizes to fill the window */
    resizeCanvases() {
        // Get the CSS-defined size of the canvas wrapper
        const cssWidth = this.tempCanvas.clientWidth;
        const cssHeight = this.tempCanvas.clientHeight;
        
        // Set the internal resolution of both canvases
        this.mainCanvas.width = this.tempCanvas.width = cssWidth;
        this.mainCanvas.height = this.tempCanvas.height = cssHeight;

        // On resize, we must redraw the main canvas from history
        this.redrawMainCanvas();
    }

    // --- SETTERS ---
    setTool(tool) { this.tool = tool; }
    setColor(color) { this.color = color; }
    setStrokeWidth(width) { this.strokeWidth = parseInt(width, 10); }
    setMyId(id) { this.myUserId = id; }
    
    // --- LOCAL DRAWING HANDLERS ---

    onMouseDown(e) {
        if (e.button !== 0) return; // Only main click
        this.isDrawing = true;
        const { x, y } = this.getMousePos(e);

        this.currentStroke = {
            tool: this.tool,
            color: this.color,
            width: this.strokeWidth,
            points: [{ x, y }]
        };

        // Emit our starting stroke
        this.emit('draw-start', this.currentStroke);
    }

    onMouseMove(e) {
        const { x, y } = this.getMousePos(e);

        // Always emit cursor movement
        this.emit('cursor-move', { x, y });
        
        if (!this.isDrawing) return;
        
        this.currentStroke.points.push({ x, y });
        
        // Emit the in-progress stroke
        this.emit('drawing', this.currentStroke);

        // Redraw the temp canvas to show our live drawing
        this.redrawTempCanvas();
    }

    onMouseUp(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        // Only commit if it's a valid stroke (not just a click)
        if (this.currentStroke && this.currentStroke.points.length > 1) {
            // Send the final, complete operation to the server
            this.emit('draw-end', this.currentStroke);
        }
        
        this.currentStroke = null;
        // Redraw temp canvas to clear our in-progress stroke
        // (It will be added to main canvas on 'global-draw-end')
        this.redrawTempCanvas();
    }

    onMouseLeave(e) {
        // If we were drawing and leave, end the stroke
        if (this.isDrawing) {
            this.onMouseUp(e);
        }
        // Remove our own cursor when mouse leaves
        this.remoteCursors.delete(this.myUserId);
        this.redrawTempCanvas();
    }

    // --- REMOTE EVENT HANDLERS ---

    handleRemoteDrawStart(data) {
        this.remoteStrokes.set(data.userId, data);
        this.redrawTempCanvas();
    }

    handleRemoteDrawing(data) {
        this.remoteStrokes.set(data.userId, data);
        this.redrawTempCanvas();
    }

    updateUserCursor(userId, x, y, name, color) {
        if (userId === this.myUserId) return; // Don't draw our own cursor
        this.remoteCursors.set(userId, { x, y, name, color });
        this.redrawTempCanvas();
    }

    removeUserCursor(userId) {
        this.remoteCursors.delete(userId);
        this.redrawTempCanvas();
    }

    // --- GLOBAL STATE SYNC HANDLERS ---

    /**
     * Called on initial connection.
     * @param {object[]} history - The entire drawing history from the server.
     */
    setLocalHistory(history) {
        this.historyStack = [...history];
        this.redoStack = [];
        this.redrawMainCanvas();
    }

    /**
     * Called when *any* user's stroke is committed to history.
     * @param {object} operation - The server-authoritative operation.
     */
    handleGlobalDrawEnd(operation) {
        // Remove from in-progress map (if it was a remote stroke)
        this.remoteStrokes.delete(operation.userId);
        
        // Add to our local history (server is source of truth)
        this.historyStack.push(operation);
        // A new action clears the redo stack
        this.redoStack = [];

        // Draw this *one* new stroke onto the main canvas
        this.drawOperation(this.mainCtx, operation);
        
        // Redraw temp canvas to clear any lingering in-progress version
        this.redrawTempCanvas();
    }

    /** Called on 'global-undo' event from server. */
    handleGlobalUndo() {
        if (this.historyStack.length === 0) return;
        const op = this.historyStack.pop();
        this.redoStack.push(op);
        
        // We must redraw the *entire* main canvas from scratch
        this.redrawMainCanvas();
    }

    /** Called on 'global-redo' event from server. */
    handleGlobalRedo(operation) {
        // Server already confirmed, just sync our stacks
        this.redoStack.pop(); 
        this.historyStack.push(operation);

        // Draw the redone operation back onto the main canvas
        this.drawOperation(this.mainCtx, operation);
    }

    // --- DRAWING & REDRAWING ---

    /**
     * Redraws the *main* canvas from the complete history stack.
     * This is slow and only done on init, resize, or undo.
     */
    redrawMainCanvas() {
        this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        this.historyStack.forEach(op => this.drawOperation(this.mainCtx, op));
    }

    /**
     * Clears and redraws the *temp* canvas.
     * This is fast and done on every mouse move.
     */
    redrawTempCanvas() {
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);

        // Draw our own in-progress stroke
        if (this.currentStroke) {
            this.drawOperation(this.tempCtx, this.currentStroke);
        }
        
        // Draw all remote in-progress strokes
        this.remoteStrokes.forEach(op => this.drawOperation(this.tempCtx, op));

        // Draw all user cursors
        this.drawCursors(this.tempCtx);
    }

    /**
     * The core drawing function. Draws a single operation (a stroke)
     * onto a given canvas context.
     * @param {CanvasRenderingContext2D} ctx - The context to draw on (main or temp).
     * @param {object} op - The operation object.
     */
    drawOperation(ctx, op) {
        if (!op || op.points.length < 1) return;

        ctx.beginPath();
        ctx.moveTo(op.points[0].x, op.points[0].y);

        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Handle the 'eraser' tool
        if (op.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        // Draw the path
        for (let i = 1; i < op.points.length; i++) {
            ctx.lineTo(op.points[i].x, op.points[i].y);
        }
        ctx.stroke();

        // Reset composite operation to default
        ctx.globalCompositeOperation = 'source-over';
    }

    /**
     * Draws all user cursors on the temp canvas.
     * @param {CanvasRenderingContext2D} ctx - The temp canvas context.
     */
    drawCursors(ctx) {
        this.remoteCursors.forEach(({ x, y, name, color }) => {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = color || '#888';
            ctx.fill();
            
            // Draw name label
            ctx.font = '12px Arial';
            ctx.fillStyle = '#000';
            ctx.fillText(name, x + 10, y + 10);
        });
    }

    // --- HELPERS ---

    /** Gets mouse position relative to the canvas */
    getMousePos(e) {
        const rect = this.tempCanvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
}