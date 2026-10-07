import { Request, Response, NextFunction } from 'express';
import { pool, getTenantSchema } from '../config/db';

const requireSchema = async (req: Request, res: Response): Promise<string | null> => {
  const schema = await getTenantSchema(req.user.id);
  if (!schema) {
    res.status(400).json({ message: 'No pharmacy organization is linked to this account.' });
    return null;
  }
  return schema;
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const { rows } = await pool.query(`
      SELECT s.*, u.name AS sold_by_name
      FROM "${schema}".sales s LEFT JOIN users u ON s.sold_by = u.id
      ORDER BY s.sold_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const sale = await pool.query(`SELECT * FROM "${schema}".sales WHERE id = $1`, [req.params.id]);
    if (!sale.rows.length) { res.status(404).json({ message: 'Sale not found' }); return; }

    const items = await pool.query(
      `SELECT si.*, m.name AS medicine_name FROM "${schema}".sale_items si
       JOIN medicines m ON si.medicine_id = m.id WHERE si.sale_id = $1`,
      [req.params.id]
    );
    res.json({ ...sale.rows[0], items: items.rows });
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const schema = await requireSchema(req, res);
  if (!schema) return;

  const client = await pool.connect();
  try {
    const { customer_name, payment_method, items } = req.body as {
      customer_name?: string;
      payment_method?: string;
      items: Array<{ medicine_id: number; quantity: number; unit_price: number }>;
    };
    await client.query('BEGIN');

    const medicineIds = items.map(i => i.medicine_id);
    const quantities  = items.map(i => i.quantity);
    const unitPrices  = items.map(i => i.unit_price);

    // Same medicine can appear as more than one line item in one sale — sum the
    // quantities per medicine so stock is checked/decremented by the combined
    // amount, not just the last line item seen for that medicine.
    const qtyByMedicine = new Map<number, number>();
    for (const item of items) {
      qtyByMedicine.set(item.medicine_id, (qtyByMedicine.get(item.medicine_id) || 0) + item.quantity);
    }
    const uniqueMedicineIds = [...qtyByMedicine.keys()];
    const combinedQuantities = uniqueMedicineIds.map(id => qtyByMedicine.get(id)!);

    // Validate stock — one round trip for every item instead of one per item.
    const { rows: stockRows } = await client.query(
      'SELECT id, stock_quantity FROM medicines WHERE id = ANY($1::int[]) FOR UPDATE',
      [uniqueMedicineIds]
    );
    const stockById = new Map<number, number>(stockRows.map(r => [r.id, r.stock_quantity]));
    for (const [medicineId, qty] of qtyByMedicine) {
      const available = stockById.get(medicineId);
      if (available === undefined || available < qty) {
        throw Object.assign(new Error(`Insufficient stock for medicine id ${medicineId}`), { status: 400 });
      }
    }

    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const sale = await client.query(
      `INSERT INTO "${schema}".sales (sold_by, customer_name, total_amount, payment_method)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, customer_name, total, payment_method || 'cash']
    );
    const saleId = sale.rows[0].id;

    // One multi-row insert and one batched update instead of two queries per item.
    await client.query(
      `INSERT INTO "${schema}".sale_items (sale_id, medicine_id, quantity, unit_price)
       SELECT $1, * FROM UNNEST($2::int[], $3::int[], $4::numeric[])`,
      [saleId, medicineIds, quantities, unitPrices]
    );
    await client.query(
      `UPDATE medicines m SET stock_quantity = stock_quantity - v.qty
       FROM UNNEST($1::int[], $2::int[]) AS v(id, qty)
       WHERE m.id = v.id`,
      [uniqueMedicineIds, combinedQuantities]
    );
    await client.query('COMMIT');
    res.status(201).json(sale.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const getAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const [trend, topMedicines, profit, today, yesterday, thisWeek, lastWeek] = await Promise.all([
      pool.query(`
        SELECT DATE(sold_at) AS date, COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS count
        FROM "${schema}".sales
        WHERE sold_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(sold_at)
        ORDER BY date ASC
      `),
      pool.query(`
        SELECT m.id, m.name, SUM(si.quantity) AS quantity, SUM(si.quantity * si.unit_price) AS revenue
        FROM "${schema}".sale_items si
        JOIN "${schema}".sales s ON si.sale_id = s.id
        JOIN medicines m ON si.medicine_id = m.id
        WHERE s.sold_at >= NOW() - INTERVAL '30 days'
        GROUP BY m.id, m.name
        ORDER BY revenue DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
               COALESCE(SUM(si.quantity * m.cost_price), 0) AS cost
        FROM "${schema}".sale_items si
        JOIN "${schema}".sales s ON si.sale_id = s.id
        JOIN medicines m ON si.medicine_id = m.id
        WHERE s.sold_at >= NOW() - INTERVAL '30 days'
      `),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales WHERE sold_at::date = CURRENT_DATE`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales WHERE sold_at::date = CURRENT_DATE - INTERVAL '1 day'`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales WHERE sold_at >= date_trunc('week', CURRENT_DATE)`),
      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales
        WHERE sold_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days'
          AND sold_at < date_trunc('week', CURRENT_DATE)
      `),
    ]);

    const revenue30 = parseFloat(profit.rows[0].revenue);
    const cost30 = parseFloat(profit.rows[0].cost);

    res.json({
      trend: trend.rows.map((r) => ({ date: r.date, revenue: parseFloat(r.revenue), count: parseInt(r.count) })),
      topMedicines: topMedicines.rows.map((r) => ({
        id: r.id, name: r.name, quantity: parseInt(r.quantity), revenue: parseFloat(r.revenue),
      })),
      profit: {
        revenue: revenue30,
        cost: cost30,
        profit: revenue30 - cost30,
        marginPct: revenue30 > 0 ? ((revenue30 - cost30) / revenue30) * 100 : 0,
      },
      comparison: {
        today: parseFloat(today.rows[0].total),
        yesterday: parseFloat(yesterday.rows[0].total),
        thisWeek: parseFloat(thisWeek.rows[0].total),
        lastWeek: parseFloat(lastWeek.rows[0].total),
      },
    });
  } catch (err) { next(err); }
};

export { getAll, getOne, create, getAnalytics };
