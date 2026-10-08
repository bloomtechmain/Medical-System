import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { sendNotification } from '../utils/notify';

// lab_requests / lab_request_messages live in the `clinical` schema behind
// row-level security — every query against them must carry the acting
// user's identity. See config/db.ts (queryAs).
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

const userName = async (uid: number): Promise<string> =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

const labName = async (labId: number): Promise<string> => {
  const { rows } = await pool.query(
    `SELECT u.name, p.lab_name FROM users u
     LEFT JOIN laboratory_profiles p ON p.user_id = u.id
     WHERE u.id = $1`, [labId]
  );
  return rows[0]?.lab_name || rows[0]?.name || 'Laboratory';
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req), `
      SELECT m.*, u.name AS sender_name
      FROM lab_request_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.lab_request_id = $1
      ORDER BY m.created_at ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { body } = req.body as { body?: string };
    if (!body || !body.trim()) { res.status(400).json({ message: 'Message cannot be empty' }); return; }

    const { rows: reqRows } = await queryAs(actor(req),
      `SELECT patient_id, doctor_id, laboratory_id FROM lab_requests WHERE id=$1`,
      [req.params.id]
    );
    if (!reqRows.length) { res.status(404).json({ message: 'Lab request not found' }); return; }
    const lr = reqRows[0];

    const { rows: [message] } = await queryAs(actor(req), `
      INSERT INTO lab_request_messages (lab_request_id, patient_id, doctor_id, laboratory_id, sender_id, sender_role, body)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.params.id, lr.patient_id, lr.doctor_id, lr.laboratory_id, req.user.id, req.user.role, body.trim()]);

    const senderName = req.user.role === 'laboratory' ? await labName(req.user.id) : await userName(req.user.id);
    const recipients = [lr.patient_id, lr.doctor_id, lr.laboratory_id]
      .filter((uid): uid is number => !!uid && uid !== req.user.id);

    await Promise.all(recipients.map(uid => sendNotification(
      uid,
      'lab_request_message',
      'New Lab Request Message',
      `${senderName}: "${body.trim()}"`,
      { lab_request_id: Number(req.params.id) }
    )));

    res.status(201).json({ ...message, sender_name: senderName });
  } catch (err) { next(err); }
};

export { getAll, create };
