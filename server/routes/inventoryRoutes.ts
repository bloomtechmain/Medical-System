import { Router } from 'express';
import { getSummary, getLowStock, getExpiring } from '../controllers/inventoryController';
import { protect } from '../middleware/auth';
import { requireFeature } from '../middleware/planGate';

const router = Router();

router.use(protect);

router.get('/summary', getSummary);
router.get('/low-stock', getLowStock);
router.get('/expiring', requireFeature('inventory_reports'), getExpiring);

export default router;
