import { Request, Response, NextFunction } from 'express';
import { queryAs, RLSActor } from '../config/db';

// notifications lives in the `clinical` schema behind row-level security —
// every query against it must carry the acting user's identity. See
// config/db.ts (queryAs).
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await queryAs(actor(req),
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// PERF-02: found by the 2x-peak load test (scripts/loadtest/run.js), not by
// reasoning about it. The previous statement was:
//
//   UPDATE notifications SET is_read = TRUE WHERE user_id = $1
//
// which produced 20 "deadlock detected" errors and 12 lock timeouts in a
// 30-second run. Two distinct faults:
//
//  1. No `is_read = FALSE` filter, so every call rewrote every notification
//     the user had ever received — an unbounded write set that grows forever
//     (PRO-04), and a lock on rows that did not need changing.
//  2. A bare UPDATE locks rows in whatever order the plan produces. Two
//     concurrent calls for the same user could therefore take the same row
//     locks in opposite orders and deadlock — a real failure for anyone with
//     two tabs open, or a double-tapped button.
//
// The subquery with ORDER BY ... FOR UPDATE makes the lock order
// deterministic, so concurrent callers queue instead of deadlocking, and the
// is_read filter means a repeat call locks nothing at all.
const markAllRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await queryAs(actor(req),
      `UPDATE notifications SET is_read = TRUE
        WHERE id IN (
          SELECT id FROM notifications
           WHERE user_id = $1 AND is_read = FALSE
           ORDER BY id
           FOR UPDATE
        )`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
};

export { getAll, markRead, markAllRead };
