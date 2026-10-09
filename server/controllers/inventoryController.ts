import { Request, Response, NextFunction } from 'express';
import { pool, resolvePharmacySchema } from '../config/db';

// SEC-17 #4: see medicineController.ts — same move from one shared public
// table into each pharmacy's own tenant schema.
const requireSchema = async (req: Request, res: Response): Promise<string | null> => {
  const orgId = parseInt((req.query.organization_id as string) ?? (req.body?.organization_id as string), 10);
  const result = await resolvePharmacySchema(
    { id: req.user.id, role: req.user.role },
    Number.isNaN(orgId) ? undefined : orgId
  );
  if ('error' in result) { res.status(result.status).json({ message: result.error }); return null; }
  return result.schema;
};

const getSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const [totalMeds, lowStock, expired, totalValue] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM "${schema}".medicines WHERE is_active = TRUE`),
      pool.query(`SELECT COUNT(*) FROM "${schema}".medicines WHERE stock_quantity <= reorder_level AND is_active = TRUE`),
      pool.query(`SELECT COUNT(*) FROM "${schema}".medicines WHERE expiry_date < NOW() AND is_active = TRUE`),
      pool.query(`SELECT COALESCE(SUM(stock_quantity * cost_price), 0) AS total FROM "${schema}".medicines WHERE is_active = TRUE`),
    ]);

    res.json({
      total_medicines: parseInt(totalMeds.rows[0].count),
      low_stock_count: parseInt(lowStock.rows[0].count),
      expired_count: parseInt(expired.rows[0].count),
      inventory_value: parseFloat(totalValue.rows[0].total),
    });
  } catch (err) { next(err); }
};

const getLowStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const { rows } = await pool.query(
      `SELECT * FROM "${schema}".medicines WHERE stock_quantity <= reorder_level AND is_active = TRUE ORDER BY stock_quantity ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getExpiring = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const days = parseInt(req.query.days as string) || 30;
    const { rows } = await pool.query(
      `SELECT * FROM "${schema}".medicines WHERE expiry_date BETWEEN NOW() AND NOW() + make_interval(days => $1) AND is_active = TRUE ORDER BY expiry_date ASC`,
      [days]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

export { getSummary, getLowStock, getExpiring };
