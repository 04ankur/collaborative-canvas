/**
 * Manages user presence and assigns colors.
 */
class RoomManager {
  constructor() {
    this.users = new Map(); // K: socket.id, V: { id, color, name }
    this.availableColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#F7D154',
      '#F9A828', '#8A2BE2', '#FF1493', '#32CD32'
    ];
    this.colorIndex = 0;
  }

  // MODIFIED addUser METHOD
  addUser(id, name) {
    const color = this.availableColors[this.colorIndex % this.availableColors.length];
    this.colorIndex++;
    
    const user = {
      id,
      color,
      name: name // Use the name passed from server.js
    };
    
    this.users.set(id, user);
    return color;
  }

  removeUser(id) {
    this.users.delete(id);
  }

  getUser(id) {
    return this.users.get(id);
  }

  getUsers() {
    return Array.from(this.users.values());
  }
}

module.exports = RoomManager;