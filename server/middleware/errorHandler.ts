import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  status?: number;
}

// SEC-21: a 500 means something unexpected happened — the error message at
// that point is whatever the underlying library/driver produced (often raw
// database error text), never written for a client to see. Log it fully
// server-side, return a generic message instead. A deliberately-set status
// (4xx, thrown by the app's own code with an intentional message) is a
// different case — those messages are safe and meant to reach the client.
const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
  const status = err.status || 500;
  console.error(`[${req.method}] ${req.path} → ${err.message}`, err.stack);

  const clientMessage = status === 500 ? 'Internal server error' : (err.message || 'Internal server error');

  res.status(status).json({
    message: clientMessage,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
