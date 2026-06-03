import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getAll, markRead, markAllRead } from '../controllers/notificationController';

const router = Router();

router.use(protect);
router.get('/',            getAll);
router.patch('/read-all',  markAllRead);
router.patch('/:id/read',  markRead);

export default router;
