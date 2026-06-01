const { pool } = require('../config/db');
const { emitToUser } = require('../config/socket');

const sendNotification = async (userId, type, title, message, data = {}) => {
  try {
    const { rows: [notif] } = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title, message, JSON.stringify(data)]
    );
    emitToUser(userId, 'notification', notif);
    return notif;
  } catch (err) {
    console.error('Notification error:', err.message);
  }
};

module.exports = { sendNotification };
