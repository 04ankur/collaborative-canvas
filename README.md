# Real-Time Collaborative Canvas

This is a multi-user, real-time drawing application built with Node.js, Express, Socket.io, and vanilla JavaScript. It allows users to join isolated, code-protected rooms to draw together.

This project fulfills all core assignment requirements, including a global undo/redo, as well as all optional bonus features.

## ✨ Features

* **Real-time Drawing:** Brush, Rectangle, and Eraser tools sync instantly between all users in a room.
* **Room System:** Users can create a new, persistent room or join an existing one using a unique, shareable room code.
* **Drawing Persistence:** All drawings are automatically saved to the server's file system on every stroke. When a user joins a room, the entire drawing history is loaded.
* **Global Undo/Redo:** A shared action history for all users in a room.
* **Mobile Touch Support:** Fully drawable from a phone or tablet.
* **Performance Metrics:** A live display of the client-side FPS and server round-trip latency (ping).
* **User Cursors:** See other users' names and cursors as they move around the canvas.

## 🚀 Setup Instructions

This project is designed to run locally with a single command.

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/04ankur/collaborative-canvas.git](https://github.com/04ankur/collaborative-canvas.git)
    cd collaborative-canvas
    ```

2.  **Install & Start:**
    This command will install all `npm` dependencies and then immediately start the server on `http://localhost:3000`.
    ```bash
    npm install && npm start
    ```

3.  **Access the App:**
    Open `http://localhost:3000` in your web browser.

## 🧪 How to Test with Multiple Users

1.  **Open the First Window:**
    * Open `http://localhost:3000`.
    * At the modal, enter your name (e.g., "User A") and a new Room Code (e.g., "TEST123").
    * Click "Start Drawing".

2.  **Open the Second Window:**
    * Open `http://localhost:3000` in a **new browser window** (or an Incognito tab).
    * Enter a different name (e.g., "User B").
    * Enter the **exact same Room Code** ("TEST123").
    * Click "Start Drawing".

3.  **Test:**
    * The users will now be in the same room.
    * Drawing in one window will appear instantly in the other.
    * You can see both users in the "Online Users" list.
    * If you stop the server, restart it (`npm start`), and rejoin "TEST123", your drawing will be re-loaded.
    * 
4. ## Demo

* **Live Site:** [collaborative-canvas-production-766c.up.railway.app](https://collaborative-canvas-production-766c.up.railway.app)
* **Video Walkthrough:** [Google Drive Link](https://drive.google.com/file/d/1iUBNLtX9vrH1zau3-vmJ7b2EVBr7vJBa/view?usp=drive_link)

## ⚠️ Known Limitations & Bugs

* **Persistence Model:** The drawing persistence is based on the server's local file system (`fs`). This works perfectly on a local machine and stateful hosts (like Railway), but **will not work** on serverless platforms like Vercel which have a read-only file system.
* **Resize Handling:** Resizing the browser window *after* drawing has started can cause the temporary (in-progress) strokes to become misaligned. A full canvas rescale and redraw is not implemented.

## ⏱️ Time Spent on the Project

* **Core Technical Implementation (Canvas, Sockets, Undo):** ~5 hours
* **Bonus Features (Rooms, Persistence, Touch, Shapes, Metrics):** ~3 hours
* **Deployment & Debugging (Git, Vercel, Railway):** ~2 hours
* **Total:** Approximately 10 hours
