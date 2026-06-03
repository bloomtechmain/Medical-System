import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  status?: number;
}

const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
  const status = err.status || 500;
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${req.method}] ${req.path} → ${err.message}`);
  }
  res.status(status).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
