import { Router } from 'express';
import { protect } from '../middleware/auth';
import { exportMyData } from '../controllers/dataExportController';

const router = Router();

// COMP-03: self-service data export. Any logged-in user, own data only —
// there is deliberately no admin "export anyone" variant, because that would
// be a single call that dumps a complete patient record and is the most
// damaging thing an abused admin session could do. Operator-handled subject
// access requests are documented in docs/data-retention.md, where identity is
// verified before anything is produced.
router.use(protect);
router.get('/me', exportMyData);

export default router;
