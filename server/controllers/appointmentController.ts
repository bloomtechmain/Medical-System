import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { sendNotification } from '../utils/notify';

// clinical.doctor_weekly_availability / doctor_availability_overrides /
// doctor_appointments all live behind row-level security — every query
// against them must carry the acting user's identity. See config/db.ts.
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

const userName = async (uid: number): Promise<string> =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

const MIN_SLOT_MINUTES = 5;
const MAX_SLOT_MINUTES = 240;
const MAX_SLOTS_DAYS   = 60;

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Local calendar date (not UTC) — matches how a browser presents "today" to the user.
const toDateStr = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Postgres TIME columns come back as "HH:MM:SS" — normalize to "HH:MM" for comparison/display.
const normTime = (t: string): string => t.slice(0, 5);

const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const minutesToTime = (m: number): string => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

interface DaySlots {
  date: string;
  day_of_week: number;
  is_available: boolean;
  overridden: boolean;
  slots: { start_time: string; end_time: string }[];
}

// Weekly pattern + per-date overrides + already-booked times → the concrete list of
// bookable slots for the next `days` days. Runs impersonating the doctor's own RLS
// identity so it can see every booking on their calendar (not just the caller's own),
// which is required to correctly exclude already-taken slots — it only ever returns
// bare start/end times here, never who booked them or why.
const computeAvailableSlots = async (doctorId: number, days: number): Promise<DaySlots[]> => {
  const doctorActor: RLSActor = { id: doctorId, role: 'doctor' };
  const today   = new Date();
  const fromStr = toDateStr(today);
  const toDateObj = new Date(today);
  toDateObj.setDate(toDateObj.getDate() + days);
  const toStr = toDateStr(toDateObj);

  const [{ rows: weekly }, { rows: overrides }, { rows: booked }] = await Promise.all([
    queryAs(doctorActor,
      'SELECT * FROM doctor_weekly_availability WHERE doctor_id=$1 AND is_active=true',
      [doctorId]),
    queryAs(doctorActor,
      'SELECT * FROM doctor_availability_overrides WHERE doctor_id=$1 AND override_date BETWEEN $2 AND $3',
      [doctorId, fromStr, toStr]),
    queryAs(doctorActor,
      `SELECT appointment_date, start_time FROM doctor_appointments
       WHERE doctor_id=$1 AND appointment_date BETWEEN $2 AND $3 AND status IN ('pending','confirmed')`,
      [doctorId, fromStr, toStr]),
  ]);

  const weeklyByDay = new Map<number, any[]>();
  for (const w of weekly) {
    if (!weeklyByDay.has(w.day_of_week)) weeklyByDay.set(w.day_of_week, []);
    weeklyByDay.get(w.day_of_week)!.push(w);
  }

  const overrideByDate = new Map<string, any>();
  for (const o of overrides) overrideByDate.set(toDateStr(new Date(o.override_date)), o);

  const bookedByDate = new Map<string, Set<string>>();
  for (const b of booked) {
    const d = toDateStr(new Date(b.appointment_date));
    if (!bookedByDate.has(d)) bookedByDate.set(d, new Set());
    bookedByDate.get(d)!.add(normTime(b.start_time));
  }

  const now = new Date();
  const result: DaySlots[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    const dow     = d.getDay();
    const override = overrideByDate.get(dateStr);
    const isAvailable = override ? override.is_available : weeklyByDay.has(dow);

    const slots: { start_time: string; end_time: string }[] = [];
    if (isAvailable) {
      const bookedSet = bookedByDate.get(dateStr) || new Set<string>();
      for (const block of weeklyByDay.get(dow) || []) {
        const start = timeToMinutes(normTime(block.start_time));
        const end   = timeToMinutes(normTime(block.end_time));
        const step  = block.slot_duration_minutes;
        for (let cursor = start; cursor + step <= end; cursor += step) {
          const startStr = minutesToTime(cursor);
          const slotDateTime = new Date(`${dateStr}T${startStr}:00`);
          if (slotDateTime > now && !bookedSet.has(startStr)) {
            slots.push({ start_time: startStr, end_time: minutesToTime(cursor + step) });
          }
        }
      }
      slots.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }

    result.push({ date: dateStr, day_of_week: dow, is_available: isAvailable && slots.length > 0, overridden: !!override, slots });
  }

  return result;
};

const getDoctorSlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctorId = parseInt(req.params.doctorId, 10);
    const days = Math.min(Math.max(parseInt((req.query.days as string) || '14', 10) || 14, 1), MAX_SLOTS_DAYS);

    const { rows: dr } = await pool.query("SELECT id FROM users WHERE id=$1 AND role='doctor'", [doctorId]);
    if (!dr.length) { res.status(404).json({ message: 'Doctor not found' }); return; }

    const availableDays = await computeAvailableSlots(doctorId, days);
    res.json({ days: availableDays });
  } catch (err) { next(err); }
};

const getWeeklyAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM doctor_weekly_availability WHERE doctor_id=$1 ORDER BY day_of_week, start_time',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const setWeeklyAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { schedule } = req.body as {
      schedule?: { day_of_week: number; start_time: string; end_time: string; slot_duration_minutes: number }[];
    };
    if (!Array.isArray(schedule)) { res.status(400).json({ message: 'schedule must be an array' }); return; }

    for (const block of schedule) {
      if (
        typeof block.day_of_week !== 'number' || block.day_of_week < 0 || block.day_of_week > 6 ||
        !TIME_RE.test(block.start_time) || !TIME_RE.test(block.end_time) ||
        timeToMinutes(block.start_time) >= timeToMinutes(block.end_time) ||
        !Number.isInteger(block.slot_duration_minutes) ||
        block.slot_duration_minutes < MIN_SLOT_MINUTES || block.slot_duration_minutes > MAX_SLOT_MINUTES
      ) {
        res.status(400).json({ message: 'Invalid availability block' }); return;
      }
    }

    const doctorId = req.user.id;
    await queryAs(actor(req), 'DELETE FROM doctor_weekly_availability WHERE doctor_id=$1', [doctorId]);

    if (schedule.length > 0) {
      const values: string[] = [];
      const params: unknown[] = [];
      schedule.forEach((b, i) => {
        const base = i * 5;
        values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
        params.push(doctorId, b.day_of_week, b.start_time, b.end_time, b.slot_duration_minutes);
      });
      await queryAs(actor(req), `
        INSERT INTO doctor_weekly_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes)
        VALUES ${values.join(',')}
      `, params);
    }

    const { rows } = await queryAs(actor(req),
      'SELECT * FROM doctor_weekly_availability WHERE doctor_id=$1 ORDER BY day_of_week, start_time',
      [doctorId]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getOverrides = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = new Date();
    const from = (req.query.from as string) && DAY_RE.test(req.query.from as string)
      ? req.query.from as string : toDateStr(today);
    const toObj = new Date(today);
    toObj.setDate(toObj.getDate() + 30);
    const to = (req.query.to as string) && DAY_RE.test(req.query.to as string)
      ? req.query.to as string : toDateStr(toObj);

    const { rows } = await queryAs(actor(req),
      'SELECT * FROM doctor_availability_overrides WHERE doctor_id=$1 AND override_date BETWEEN $2 AND $3 ORDER BY override_date',
      [req.user.id, from, to]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const setOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { date, is_available, reason } = req.body as { date?: string; is_available?: boolean; reason?: string };
    if (!date || !DAY_RE.test(date))      { res.status(400).json({ message: 'Valid date is required' }); return; }
    if (typeof is_available !== 'boolean') { res.status(400).json({ message: 'is_available must be true or false' }); return; }
    if (date < toDateStr(new Date()))     { res.status(400).json({ message: 'Cannot set availability for a past date' }); return; }

    const { rows: [row] } = await queryAs(actor(req), `
      INSERT INTO doctor_availability_overrides (doctor_id, override_date, is_available, reason)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (doctor_id, override_date)
      DO UPDATE SET is_available=EXCLUDED.is_available, reason=EXCLUDED.reason, updated_at=NOW()
      RETURNING *
    `, [req.user.id, date, is_available, reason || null]);

    res.status(201).json(row);
  } catch (err) { next(err); }
};

const deleteOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rowCount } = await queryAs(actor(req),
      'DELETE FROM doctor_availability_overrides WHERE id=$1 AND doctor_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) { res.status(404).json({ message: 'Override not found' }); return; }
    res.status(204).end();
  } catch (err) { next(err); }
};

const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { doctor_id, appointment_date, start_time, reason } = req.body as {
      doctor_id?: number; appointment_date?: string; start_time?: string; reason?: string;
    };
    const patientId = req.user.id;

    if (!doctor_id)                              { res.status(400).json({ message: 'Doctor is required' }); return; }
    if (!appointment_date || !DAY_RE.test(appointment_date)) { res.status(400).json({ message: 'Valid appointment date is required' }); return; }
    if (!start_time || !TIME_RE.test(start_time)) { res.status(400).json({ message: 'Valid start time is required' }); return; }
    if (appointment_date < toDateStr(new Date())) { res.status(400).json({ message: 'Cannot book a date in the past' }); return; }

    const { rows: dr } = await pool.query("SELECT id, name FROM users WHERE id=$1 AND role='doctor'", [doctor_id]);
    if (!dr.length) { res.status(404).json({ message: 'Doctor not found' }); return; }

    const daysAhead = Math.min(
      Math.ceil((new Date(appointment_date).getTime() - Date.now()) / 86_400_000) + 1,
      MAX_SLOTS_DAYS
    );
    const availableDays = await computeAvailableSlots(doctor_id, Math.max(daysAhead, 1));
    const day = availableDays.find(d => d.date === appointment_date);
    const slot = day?.slots.find(s => s.start_time === start_time);
    if (!slot) { res.status(409).json({ message: 'That slot is no longer available. Please choose another.' }); return; }

    let appointment;
    try {
      ({ rows: [appointment] } = await queryAs(actor(req), `
        INSERT INTO doctor_appointments (doctor_id, patient_id, appointment_date, start_time, end_time, reason)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
      `, [doctor_id, patientId, appointment_date, slot.start_time, slot.end_time, reason || null]));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ message: 'That slot was just booked by someone else. Please choose another.' }); return;
      }
      throw err;
    }

    const ptName = await userName(patientId);
    await sendNotification(
      doctor_id,
      'appointment_request',
      'New Appointment Request',
      `${ptName} has requested an appointment on ${appointment_date} at ${normTime(slot.start_time)}.`,
      { appointment_id: appointment.id, patient_id: patientId }
    );

    res.status(201).json(appointment);
  } catch (err) { next(err); }
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, id } = req.user;
    const condMap: Record<string, string> = { doctor: 'a.doctor_id = $1', patient: 'a.patient_id = $1' };
    const cond = condMap[role];
    if (!cond) { res.json([]); return; }

    const { rows } = await queryAs(actor(req), `
      SELECT a.*,
        dr.name AS doctor_name,
        pt.name AS patient_name,
        dp.specialization AS doctor_specialization,
        dp.hospital_affiliation AS doctor_hospital
      FROM doctor_appointments a
      JOIN users dr ON dr.id = a.doctor_id
      JOIN users pt ON pt.id = a.patient_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
      WHERE ${cond}
      ORDER BY a.appointment_date DESC, a.start_time DESC
    `, [id]);

    res.json(rows);
  } catch (err) { next(err); }
};

const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  doctor:  { pending: ['confirmed', 'declined'], confirmed: ['completed', 'cancelled'] },
  patient: { pending: ['cancelled'], confirmed: ['cancelled'] },
};

const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, doctor_notes } = req.body as { status?: string; doctor_notes?: string };
    const { role, id } = req.user;

    const { rows: existing } = await queryAs(actor(req), 'SELECT * FROM doctor_appointments WHERE id=$1', [req.params.id]);
    if (!existing.length) { res.status(404).json({ message: 'Appointment not found' }); return; }
    const appt = existing[0];

    const isParty = (role === 'doctor' && appt.doctor_id === id) || (role === 'patient' && appt.patient_id === id);
    if (!isParty) { res.status(403).json({ message: 'Not authorized for this appointment' }); return; }

    const allowedNext = ALLOWED_TRANSITIONS[role]?.[appt.status] || [];
    if (!status || !allowedNext.includes(status)) {
      res.status(400).json({ message: `Cannot change status from ${appt.status} to ${status}` }); return;
    }

    const respondedNow = ['confirmed', 'declined'].includes(status);
    const { rows: [updated] } = await queryAs(actor(req), `
      UPDATE doctor_appointments
      SET status=$1, doctor_notes=COALESCE($2, doctor_notes), updated_at=NOW()
          ${respondedNow ? ', responded_at=NOW()' : ''}
      WHERE id=$3 RETURNING *
    `, [status, doctor_notes || null, req.params.id]);

    const drName = await userName(appt.doctor_id);
    const ptName = await userName(appt.patient_id);
    const when   = `${updated.appointment_date} at ${normTime(updated.start_time)}`;

    if (status === 'confirmed') {
      await sendNotification(appt.patient_id, 'appointment_confirmed', 'Appointment Confirmed ✅',
        `Dr. ${drName} confirmed your appointment on ${when}.`, { appointment_id: appt.id });
    } else if (status === 'declined') {
      await sendNotification(appt.patient_id, 'appointment_declined', 'Appointment Declined',
        `Dr. ${drName} declined your appointment request for ${when}.${doctor_notes ? ` Reason: ${doctor_notes}` : ''}`,
        { appointment_id: appt.id });
    } else if (status === 'cancelled') {
      const otherParty = role === 'doctor' ? appt.patient_id : appt.doctor_id;
      const canceller  = role === 'doctor' ? `Dr. ${drName}` : ptName;
      await sendNotification(otherParty, 'appointment_cancelled', 'Appointment Cancelled',
        `${canceller} cancelled the appointment on ${when}.`, { appointment_id: appt.id });
    } else if (status === 'completed') {
      await sendNotification(appt.patient_id, 'appointment_completed', 'Appointment Completed',
        `Your appointment with Dr. ${drName} on ${when} has been marked as completed.`, { appointment_id: appt.id });
    }

    res.json(updated);
  } catch (err) { next(err); }
};

export {
  getDoctorSlots, getWeeklyAvailability, setWeeklyAvailability,
  getOverrides, setOverride, deleteOverride,
  createAppointment, getAll, updateStatus,
};
