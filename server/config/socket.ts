import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JwtUser } from '../types';
import { ALLOWED_ORIGINS } from './corsOrigins';

interface AuthSocket extends Socket {
  user?: JwtUser;
}

let io: Server;

// ARCH-05: without a shared adapter, each server instance only knows about
// its own connected sockets — a notification triggered while the recipient
// is connected to a *different* instance silently never reaches them. Set
// REDIS_URL once Redis exists to fix this; until then, Socket.IO falls back
// to its default in-memory adapter, correct for exactly one instance (today).
const attachRedisAdapter = async (server: Server): Promise<void> => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn(
      '[socket] REDIS_URL is not set — notifications only reach users connected to this same server instance (ARCH-05). Set REDIS_URL once Redis exists, before running more than one instance.'
    );
    return;
  }
  const { createAdapter } = await import('@socket.io/redis-adapter');
  const { default: Redis } = await import('ioredis');
  const pubClient = new Redis(redisUrl);
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err: Error) => console.error('[socket] Redis pub client error:', err.message));
  subClient.on('error', (err: Error) => console.error('[socket] Redis sub client error:', err.message));
  server.adapter(createAdapter(pubClient, subClient));
  console.log('[socket] Redis adapter attached — notifications now work across multiple server instances.');
};

const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
        cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
      credentials: true,
    },
  });

  // Fire-and-forget: ioredis queues commands until connected, so the server
  // doesn't need to block startup on this. Socket.IO works single-instance
  // (default in-memory adapter) in the brief window before it attaches.
  void attachRedisAdapter(io);

  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET as string) as JwtUser;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    const uid = socket.user?.id;
    if (uid) socket.join(`user:${uid}`);
    socket.on('disconnect', () => {});
  });

  return io;
};

const getIO = (): Server => io;

const emitToUser = (userId: number, event: string, payload: unknown): void => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

export { initSocket, getIO, emitToUser };
