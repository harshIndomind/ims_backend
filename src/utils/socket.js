// socket.js
let io;
const onlineUsers = new Map(); // Map<userId, socketId>

module.exports = {
  init: (server) => {
    const { Server } = require("socket.io");
    io = new Server(server, {
      cors: {
        origin: "https://localhost:3000",
        methods: ["GET", "POST"],
      },
    });

    io.on("connection", (socket) => {
      console.log("🔌 User connected:", socket.id);

      socket.on("register", (userId) => {
        console.log(`User ${userId} registered with socket ${socket.id}`);
        onlineUsers.set(userId, socket.id);
      });

      socket.on("disconnect", () => {
        for (let [userId, sockId] of onlineUsers.entries()) {
          if (sockId === socket.id) {
            onlineUsers.delete(userId);
            break;
          }
        }
        console.log("❌ User disconnected:", socket.id);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }

    return io;
  },

  // ✅ Function to send notification to specific user
  sendToUser: (userId, event, data) => {    
    const socketId = onlineUsers.get(userId);
    if (socketId && io.sockets.sockets.get(socketId)) {
      io.to(socketId).emit(event, data);
    }
  },
};
