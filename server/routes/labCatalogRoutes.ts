import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { getMine, create, update, toggleActive, getForLab } from '../controllers/labCatalogController';
import { requireWithinLimit } from '../middleware/planGate';

const router = Router();

router.get('/',     protect, authorize('laboratory'), getMine);
router.post('/',    protect, authorize('laboratory'), requireWithinLimit('test_catalog'), create);
router.put('/:id',  protect, authorize('laboratory'), update);
router.patch('/:id/toggle', protect, authorize('laboratory'), toggleActive);

router.get('/lab/:laboratoryId', protect, authorize('patient', 'doctor', 'laboratory', 'admin'), getForLab);

export default router;
