import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { createRequest, respond, getAll, serveFile } from '../controllers/labViewRequestController';
import { requireFeature } from '../middleware/planGate';

const router = Router();

router.get('/',              protect, authorize('doctor', 'patient'), getAll);
router.post('/',             protect, authorize('doctor'), requireFeature('lab_report_access'),            createRequest);
router.patch('/:id/respond', protect, authorize('patient'),           respond);
router.get('/:id/file',      protect, authorize('doctor'),            serveFile);

export default router;
