/**
 * Manages the global drawing state using O(1) stack operations.
 * This is the "single source of truth" for the canvas.
 */
class DrawingState {
  constructor() {
    this.historyStack = [];
    this.redoStack = [];
  }

  /**
   * Adds a completed drawing operation to the history.
   * This clears the redo stack.
   * @param {object} operation - The drawing operation.
   */
  addOperation(operation) {
    this.historyStack.push(operation);
    this.redoStack = []; // Any new action clears the redo stack
  }

  /**
   * Undoes the last operation, moving it to the redo stack. (O(1))
   * @returns {object | null} The operation that was undone.
   */
  undo() {
    if (this.historyStack.length === 0) {
      return null;
    }
    const op = this.historyStack.pop();
    this.redoStack.push(op);
    return op;
  }

  /**
   * Redoes the last undone operation. (O(1))
   * @returns {object | null} The operation that was redone.
   */
  redo() {
    if (this.redoStack.length === 0) {
      return null;
    }
    const op = this.redoStack.pop();
    this.historyStack.push(op);
    return op;
  }

  /**
   * Gets the entire drawing history.
   * @returns {object[]} The array of history operations.
   */
  getHistory() {
    return this.historyStack;
  }
}

module.exports = DrawingState;