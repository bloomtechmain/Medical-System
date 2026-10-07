import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import { JwtUser } from '../types';

// SEC-17 #3: a valid JWT signature used to be the only check — a suspended
// or deleted account kept working for up to 7 days (the token's lifetime)
// after being deactivated. This adds one indexed lookup per request to
// confirm the account is still real and still active, so "deactivated"
// actually means deactivated, not "deactivated once this token expires."
const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Not authorized, no token' });
    return;
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtUser;

    const { rows } = await pool.query('SELECT is_active FROM public.users WHERE id = $1', [decoded.id]);
    if (!rows.length || !rows[0].is_active) {
      res.status(401).json({ message: 'Not authorized, account no longer active' });
      return;
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

const authorize = (...roles: string[]) => (req: Request, res: Response, next: NextFunction): void => {
  if (!roles.includes(req.user.role)) {
    res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    return;
  }
  next();
};

export { protect, authorize };
