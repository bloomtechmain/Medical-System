const { pool } = require('../config/db');

const getSummary = async (req, res, next) => {
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

const getLowStock = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM medicines WHERE stock_quantity <= reorder_level AND is_active = TRUE ORDER BY stock_quantity ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getExpiring = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rows } = await pool.query(
      `SELECT * FROM medicines WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '${days} days' AND is_active = TRUE ORDER BY expiry_date ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

module.exports = { getSummary, getLowStock, getExpiring };
