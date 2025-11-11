export class CanvasManager {
    constructor(mainCanvasEl, tempCanvasEl, emit) {
        this.mainCanvas = mainCanvasEl;
        this.mainCtx = mainCanvasEl.getContext('2d');
        this.tempCanvas = tempCanvasEl;
        this.tempCtx = tempCanvasEl.getContext('2d');
        this.emit = emit; // Function to emit WebSocket events

        // For HiDPI / Retina displays
        this.pixelRatio = window.devicePixelRatio || 1;

        this.myUserId = null;
        this.isDrawing = false;
        
        // --- State ---
        this.currentStroke = null;      // Our own in-progress stroke
        this.remoteStrokes = new Map(); // Other users' in-progress strokes
        this.remoteCursors = new Map(); // Other users' cursors
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
        
        // Mouse Events
        this.tempCanvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.tempCanvas.addEventListener('pointermove', (e) => this.onMouseMove(e));
        this.tempCanvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.tempCanvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));

        // Touch Events
        this.tempCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent screen scroll
            this.onPointerDown(e);
        }, { passive: false });

        this.tempCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault(); // Prevent screen scroll
            this.onMouseMove(e);
        }, { passive: false });

        this.tempCanvas.addEventListener('touchend', (e) => this.onPointerUp(e));
        this.tempCanvas.addEventListener('touchcancel', (e) => this.onPointerUp(e));
    }

    /** Adjust canvas sizes to fill the window and account for HiDPI */
    resizeCanvases() {
        // Get CSS display size
        const cssWidth = this.mainCanvas.clientWidth;
        const cssHeight = this.mainCanvas.clientHeight;
        
        // Set physical backend size
        const physicalWidth = Math.floor(cssWidth * this.pixelRatio);
        const physicalHeight = Math.floor(cssHeight * this.pixelRatio);
        
        this.mainCanvas.width = this.tempCanvas.width = physicalWidth;
        this.mainCanvas.height = this.tempCanvas.height = physicalHeight;

        // Scale the contexts to match CSS pixels
        this.mainCtx.scale(this.pixelRatio, this.pixelRatio);
        this.tempCtx.scale(this.pixelRatio, this.pixelRatio);

        // On resize, we must redraw the main canvas from history
        this.redrawMainCanvas();
    }

    // --- SETTERS ---
    setTool(tool) { this.tool = tool; }
    setColor(color) { this.color = color; }
    setStrokeWidth(width) { this.strokeWidth = parseInt(width, 10); }
    setMyId(id) { this.myUserId = id; }
    
    // --- LOCAL DRAWING HANDLERS ---

    onPointerDown(e) {
        if (e.button && e.button !== 0) return; // Allow touch (no button)
        this.isDrawing = true;
        this.tempCanvas.setPointerCapture?.(e.pointerId);
        
        const { x, y } = this.getEventPos(e);

        this.currentStroke = {
            tool: this.tool,
            color: this.color,
            width: this.strokeWidth,
            points: [{ x, y }] // All tools start with one point
        };

        this.emit('draw-start', this.currentStroke);
    }

    onMouseMove(e) {
        const { x, y } = this.getEventPos(e);
        this.emit('cursor-move', { x, y });
        
        if (!this.isDrawing) return;
        
        if (this.tool === 'brush' || this.tool === 'eraser') {
            // Brush logic: append points
            this.currentStroke.points.push({ x, y });
        } else if (this.tool === 'rectangle') {
            // Shape logic: only store start and end
            if (this.currentStroke.points.length > 1) {
                this.currentStroke.points.pop(); // Remove previous end point
            }
            this.currentStroke.points.push({ x, y }); // Add new end point
        }
        
        this.emit('drawing', this.currentStroke);
        this.redrawTempCanvas();
    }

    onPointerUp(e) {
        this.tempCanvas.releasePointerCapture?.(e.pointerId);
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        // Ensure rectangle has start and end
        if (this.tool === 'rectangle' && this.currentStroke.points.length < 2) {
            this.currentStroke = null;
            this.redrawTempCanvas();
            return;
        }

        this.emit('draw-end', this.currentStroke);
        this.currentStroke = null;
        this.redrawTempCanvas();
    }

    onMouseLeave(e) {
        if (this.isDrawing) {
            this.onPointerUp(e);
        }
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
        if (userId === this.myUserId) return;
        this.remoteCursors.set(userId, { x, y, name, color });
        this.redrawTempCanvas();
    }

    removeUserCursor(userId) {
        this.remoteCursors.delete(userId);
        this.redrawTempCanvas();
    }

    // --- GLOBAL STATE SYNC HANDLERS ---

    setLocalHistory(history) {
        this.historyStack = [...history];
        this.redoStack = [];
        this.redrawMainCanvas();
    }

    handleGlobalDrawEnd(operation) {
        this.remoteStrokes.delete(operation.userId);
        
        this.historyStack.push(operation);
        this.redoStack = [];

        // Draw this one new stroke onto the main canvas
        this.drawOperation(this.mainCtx, operation);
        this.redrawTempCanvas();
    }

    handleGlobalUndo() {
        if (this.historyStack.length === 0) return;
        const op = this.historyStack.pop();
        this.redoStack.push(op);
        this.redrawMainCanvas();
    }

    handleGlobalRedo(operation) {
        this.redoStack.pop(); 
        this.historyStack.push(operation);
        this.drawOperation(this.mainCtx, operation);
    }

    // --- DRAWING & REDRAWING ---

    redrawMainCanvas() {
        // Clear with CSS size
        const cssWidth = this.tempCanvas.clientWidth;
        const cssHeight = this.tempCanvas.clientHeight;
        this.mainCtx.clearRect(0, 0, cssWidth, cssHeight);
        
        this.historyStack.forEach(op => this.drawOperation(this.mainCtx, op));
    }

    redrawTempCanvas() {
        // Clear with CSS size
        const cssWidth = this.tempCanvas.clientWidth;
        const cssHeight = this.tempCanvas.clientHeight;
        this.tempCtx.clearRect(0, 0, cssWidth, cssHeight);

        if (this.currentStroke) {
            this.drawOperation(this.tempCtx, this.currentStroke);
        }
        this.remoteStrokes.forEach(op => this.drawOperation(this.tempCtx, op));
        this.drawCursors(this.tempCtx);
    }

    /**
     * The core drawing function. Now handles different tool types.
     */
    drawOperation(ctx, op) {
        if (!op || op.points.length < 1) return;

        ctx.save();

        // Set common styles
        ctx.strokeStyle = op.color;
        ctx.fillStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Handle tool-specific logic
        switch (op.tool) {
            case 'eraser':
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                // (Fall-through to brush logic for drawing)
            
            case 'brush':
                this.drawBrushStroke(ctx, op.points);
                break;

            case 'rectangle':
                this.drawRectangle(ctx, op.points);
                break;
            
            default:
                // Fallback for old data
                this.drawBrushStroke(ctx, op.points);
        }

        ctx.restore();
    }

    /**
     * Helper for drawing a standard brush stroke
     */
    drawBrushStroke(ctx, pts) {
        if (pts.length === 1) {
            // Draw a dot
            ctx.beginPath();
            ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Draw a smoothed line
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 1; i++) {
                const midX = (pts[i].x + pts[i + 1].x) / 2;
                const midY = (pts[i].y + pts[i + 1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
            }
            const last = pts[pts.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
        }
    }

    /**
     * Helper for drawing a rectangle
     */
    drawRectangle(ctx, pts) {
        if (pts.length < 2) return; // Need start and end
        
        const start = pts[0];
        const end = pts[pts.length - 1]; // Use the last point
        const width = end.x - start.x;
        const height = end.y - start.y;
        
        // Use strokeRect to draw the outline
        ctx.strokeRect(start.x, start.y, width, height);
    }

    drawCursors(ctx) {
        this.remoteCursors.forEach(({ x, y, name, color }) => {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = color || '#888';
            ctx.fill();
            
            ctx.font = '12px Arial';
            ctx.fillStyle = '#000';
            ctx.fillText(name, x + 10, y + 10);
        });
    }

    // --- HELPERS ---

    /** Gets mouse/touch position relative to the canvas (in CSS pixels) */
    getEventPos(e) {
        const rect = this.tempCanvas.getBoundingClientRect();

        // Check for touch events
        if (e.touches && e.touches.length > 0) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        
        // Fallback for mouse events
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
}