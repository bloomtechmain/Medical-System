import { queryAs } from '../config/db';
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
    // Notifications are written by the system on behalf of whichever user
    // triggered the event, addressed to a *different* recipient — so the
    // RLS check "user_id = app_uid()" can never pass for the acting user.
    // Run this one insert with an admin context, which the notif_all
    // policy explicitly allows.
    const { rows: [notif] } = await queryAs<Notification>({ role: 'admin' },
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
