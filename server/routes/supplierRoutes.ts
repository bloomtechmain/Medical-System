import { Router } from 'express';
import { getAll, getOne, create, update, remove } from '../controllers/supplierController';
import { protect, authorize } from '../middleware/auth';
import { requireWithinLimit } from '../middleware/planGate';

const router = Router();

router.use(protect);

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', authorize('admin', 'pharmacist'), requireWithinLimit('suppliers'), create);
router.put('/:id', authorize('admin', 'pharmacist'), update);
router.delete('/:id', authorize('admin'), remove);

export default router;
