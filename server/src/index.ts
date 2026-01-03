import { Server } from 'colyseus';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom';

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

const gameServer = new Server();
gameServer.attach({ server: httpServer });

// Register game room
gameServer.define('game', GameRoom)
  .enableRealtimeListing();

// Start the server
httpServer.listen(port, () => {
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
