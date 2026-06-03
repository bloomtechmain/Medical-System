import { pool } from '../config/db';
import { emitToUser } from '../config/socket';
import { Notification } from '../types';

const sendNotification = async (
  userId: number,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown> = {}
): Promise<Notification | undefined> => {
  try {
    const { rows: [notif] } = await pool.query<Notification>(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title, message, JSON.stringify(data)]
    );
    emitToUser(userId, 'notification', notif);
    return notif;
  } catch (err) {
    console.error('Notification error:', (err as Error).message);
  }
};

export { sendNotification };
