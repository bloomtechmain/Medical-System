const { pool } = require('../config/db');

const getAll = async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Supplier not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, contact, phone, email, address } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO suppliers (name, contact, phone, email, address) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, contact, phone, email, address]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { name, contact, phone, email, address } = req.body;
    const { rows } = await pool.query(
      'UPDATE suppliers SET name=$1, contact=$2, phone=$3, email=$4, address=$5 WHERE id=$6 RETURNING *',
      [name, contact, phone, email, address, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Supplier not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Supplier not found' });
    res.status(204).end();
  } catch (err) { next(err); }
};

module.exports = { getAll, getOne, create, update, remove };
