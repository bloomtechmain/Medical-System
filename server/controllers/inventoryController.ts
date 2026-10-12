import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { parsePaging } from '../utils/pagination';

const getSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [totalMeds, lowStock, expired, totalValue] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM medicines WHERE is_active = TRUE'),
      pool.query('SELECT COUNT(*) FROM medicines WHERE stock_quantity <= reorder_level AND is_active = TRUE'),
      pool.query('SELECT COUNT(*) FROM medicines WHERE expiry_date < NOW() AND is_active = TRUE'),
      pool.query('SELECT COALESCE(SUM(stock_quantity * cost_price), 0) AS total FROM medicines WHERE is_active = TRUE'),
    ]);

    res.json({
      total_medicines: parseInt(totalMeds.rows[0].count),
      low_stock_count: parseInt(lowStock.rows[0].count),
      expired_count: parseInt(expired.rows[0].count),
      inventory_value: parseFloat(totalValue.rows[0].total),
    });
  } catch (err) { next(err); }
};

// PERF-04: never paginated. See utils/pagination.ts for why the default is
// generous rather than "a page."
const getLowStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit, offset } = parsePaging(req.query as Record<string, string | undefined>);
    const { rows } = await pool.query(
      `SELECT * FROM medicines WHERE stock_quantity <= reorder_level AND is_active = TRUE
       ORDER BY stock_quantity ASC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getExpiring = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const { limit, offset } = parsePaging(req.query as Record<string, string | undefined>);
    const { rows } = await pool.query(
      `SELECT * FROM medicines WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '${days} days' AND is_active = TRUE
       ORDER BY expiry_date ASC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

export { getSummary, getLowStock, getExpiring };
