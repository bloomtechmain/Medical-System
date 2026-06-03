import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role } = req.query as { role?: string };
    let query = 'SELECT id, name, email, role, is_active, created_at FROM users';
    const params: string[] = [];
    if (role) { query += ' WHERE role = $1'; params.push(role); }
    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, role, is_active } = req.body as {
      name: string; email: string; role: string; is_active: boolean;
    };
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, email=$2, role=$3, is_active=$4, updated_at=NOW()
       WHERE id=$5 RETURNING id, name, email, role, is_active`,
      [name, email, role, is_active, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const toggleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING id, name, email, role, is_active`,
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) { res.status(404).json({ message: 'User not found' }); return; }
    res.status(204).end();
  } catch (err) { next(err); }
};

const getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE role = 'patient')     AS total_patients,
        COUNT(*) FILTER (WHERE role = 'doctor')      AS total_doctors,
        COUNT(*) FILTER (WHERE role = 'pharmacist')  AS total_pharmacists,
        COUNT(*) FILTER (WHERE role = 'laboratory')  AS total_laboratories,
        COUNT(*) FILTER (WHERE role = 'admin')       AS total_admins,
        COUNT(*)                                      AS total_users,
        COUNT(*) FILTER (WHERE is_active = TRUE)     AS active_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS new_this_week
      FROM users
    `);
    const medStats = await pool.query(`
      SELECT
        COUNT(*) AS total_medicines,
        COUNT(*) FILTER (WHERE stock_quantity <= reorder_level) AS low_stock,
        COUNT(*) FILTER (WHERE expiry_date < NOW()) AS expired
      FROM medicines WHERE is_active = TRUE
    `);
    res.json({ users: rows[0], medicines: medStats.rows[0] });
  } catch (err) { next(err); }
};

const searchPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { q = '' } = req.query as { q?: string };
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active,
             p.phone, p.date_of_birth, p.blood_type, p.gender
      FROM users u
      LEFT JOIN patient_profiles p ON p.user_id = u.id
      WHERE u.role = 'patient' AND u.is_active = TRUE
        AND (u.name ILIKE $1 OR u.email ILIKE $1)
      ORDER BY u.name LIMIT 20
    `, [`%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
};

const searchPharmacists = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { q = '' } = req.query as { q?: string };
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active,
             p.pharmacy_name, p.pharmacy_address, p.phone,
             p.license_number, p.specialization_area
      FROM users u
      LEFT JOIN pharmacist_profiles p ON p.user_id = u.id
      WHERE u.role = 'pharmacist' AND u.is_active = TRUE
        AND (u.name ILIKE $1 OR p.pharmacy_name ILIKE $1
             OR p.pharmacy_address ILIKE $1 OR u.email ILIKE $1)
      ORDER BY p.pharmacy_name NULLS LAST, u.name LIMIT 20
    `, [`%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
};

const searchLaboratories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { q = '' } = req.query as { q?: string };
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active,
             p.lab_name, p.lab_type, p.address, p.phone,
             p.accreditation, p.operating_hours, p.services_offered, p.license_number
      FROM users u
      LEFT JOIN laboratory_profiles p ON p.user_id = u.id
      WHERE u.role = 'laboratory' AND u.is_active = TRUE
        AND (u.name ILIKE $1 OR p.lab_name ILIKE $1
             OR p.address ILIKE $1 OR p.lab_type ILIKE $1
             OR u.email ILIKE $1)
      ORDER BY p.lab_name NULLS LAST, u.name LIMIT 20
    `, [`%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
};

export { getAll, getOne, update, toggleActive, remove, getStats, searchPatients, searchPharmacists, searchLaboratories };
