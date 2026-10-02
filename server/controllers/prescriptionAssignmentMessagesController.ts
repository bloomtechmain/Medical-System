import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { sendNotification } from '../utils/notify';

// prescription_assignments / prescription_assignment_messages live in the
// `clinical` schema behind row-level security — every query against them
// must carry the acting user's identity. See config/db.ts (queryAs).
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

const userName = async (uid: number): Promise<string> =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

const pharmacyName = async (pharmacistId: number): Promise<string> => {
  const { rows } = await pool.query(
    `SELECT u.name, p.pharmacy_name FROM users u
     LEFT JOIN pharmacist_profiles p ON p.user_id = u.id
     WHERE u.id = $1`, [pharmacistId]
  );
  return rows[0]?.pharmacy_name || rows[0]?.name || 'Pharmacy';
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req), `
      SELECT m.*, u.name AS sender_name
      FROM prescription_assignment_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.assignment_id = $1
      ORDER BY m.created_at ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { body } = req.body as { body?: string };
    if (!body || !body.trim()) { res.status(400).json({ message: 'Message cannot be empty' }); return; }

    const { rows: paRows } = await queryAs(actor(req), `
      SELECT pa.pharmacist_id, c.patient_id
      FROM prescription_assignments pa
      JOIN medical_consultations c ON c.id = pa.consultation_id
      WHERE pa.id = $1
    `, [req.params.id]);
    if (!paRows.length) { res.status(404).json({ message: 'Prescription assignment not found' }); return; }
    const pa = paRows[0];

    const { rows: [message] } = await queryAs(actor(req), `
      INSERT INTO prescription_assignment_messages (assignment_id, patient_id, pharmacist_id, sender_id, sender_role, body)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.params.id, pa.patient_id, pa.pharmacist_id, req.user.id, req.user.role, body.trim()]);

    const senderName = req.user.role === 'pharmacist' ? await pharmacyName(req.user.id) : await userName(req.user.id);
    const recipient = req.user.id === pa.patient_id ? pa.pharmacist_id : pa.patient_id;

    await sendNotification(
      recipient,
      'prescription_message',
      'New Pharmacy Message',
      `${senderName}: "${body.trim()}"`,
      { assignment_id: Number(req.params.id) }
    );

    res.status(201).json({ ...message, sender_name: senderName });
  } catch (err) { next(err); }
};

export { getAll, create };
