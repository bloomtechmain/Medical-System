import { Router } from 'express';
import { getAll, getOne, create, getAnalytics } from '../controllers/saleController';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', getAll);
router.get('/analytics', getAnalytics);
router.get('/:id', getOne);
router.post('/', create);

export default router;
