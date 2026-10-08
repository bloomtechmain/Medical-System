import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }
  next();
};

// PRO-06: every endpoint should reject fields it doesn't recognize instead of
// silently accepting (and, for several controllers, interpolating) whatever
// the client sends. `allowed` is the exact set of top-level req.body keys an
// endpoint understands; anything else is a 422, not a silent no-op.
const rejectUnknownFields = (allowed: string[]) => {
  const allowedSet = new Set(allowed);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object') {
      const unknown = Object.keys(req.body).filter(k => !allowedSet.has(k));
      if (unknown.length) {
        res.status(422).json({ message: `Unknown field(s): ${unknown.join(', ')}` });
        return;
      }
    }
    next();
  };
};

export default validate;
export { rejectUnknownFields };
