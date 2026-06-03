import { Router } from 'express';
import { getAll, getOne, create, receive } from '../controllers/orderController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', authorize('admin', 'pharmacist'), create);
router.patch('/:id/receive', authorize('admin', 'pharmacist'), receive);

export default router;
