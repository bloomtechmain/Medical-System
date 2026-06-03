import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JwtUser } from '../types';

interface AuthSocket extends Socket {
  user?: JwtUser;
}

let io: Server;

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
        cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
      credentials: true,
    },
  });

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
