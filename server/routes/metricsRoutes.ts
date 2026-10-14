import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { getBusinessMetrics } from '../controllers/metricsController';

const router = Router();

// MON-07: whole-platform business metrics. Admin-only — the per-hour shape of
// sign-ups and failed logins is operational detail no tenant should see, and
// an unauthenticated metrics endpoint would hand an attacker a live readout of
// whether their login attempts are being noticed.
router.use(protect, authorize('admin'));
router.get('/business', getBusinessMetrics);

export default router;
