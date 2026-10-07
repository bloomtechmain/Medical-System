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

    // SEC-17 #7: impersonation_log only recorded that a session started —
    // nothing taken during it. Mutating requests (not reads — high-volume,
    // low audit value) made while impersonating are logged here, in the
    // one place that already sees every request and already knows
    // impersonatedBy from the JWT. Fire-and-forget: a logging failure
    // must never block the actual request.
    if (decoded.impersonatedBy && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      pool.query(
        'INSERT INTO public.impersonation_action_log (admin_id, target_user_id, method, path) VALUES ($1,$2,$3,$4)',
        [decoded.impersonatedBy, decoded.id, req.method, req.originalUrl]
      ).catch(err => console.error('[impersonation_action_log]', (err as Error).message));
    }

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
