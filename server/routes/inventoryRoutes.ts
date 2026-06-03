import { Router } from 'express';
import { getSummary, getLowStock, getExpiring } from '../controllers/inventoryController';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/summary', getSummary);
router.get('/low-stock', getLowStock);
router.get('/expiring', getExpiring);

export default router;
