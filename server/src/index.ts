import { Server, WebSocketTransport } from 'colyseus';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom.js';

const port = parseInt(process.env.PORT || '2567');

const app = express();

// Enable CORS for client connections
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());

// Health check endpoint for hosting platforms
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Room info endpoint
app.get('/rooms', async (req, res) => {
  try {
    // This would return active rooms - simplified for now
    res.json({ rooms: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

// Register game room
gameServer.define('game', GameRoom)
  .enableRealtimeListing();

// Start the server
gameServer.listen(port).then(() => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║   GTA Multiplayer Server                         ║
  ║   Running on port ${port}                           ║
  ║                                                  ║
  ║   WebSocket: ws://localhost:${port}                 ║
  ║   Health:    http://localhost:${port}/health        ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
  `);
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  gameServer.gracefullyShutdown();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  gameServer.gracefullyShutdown();
});
