import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { getVitals, getVitalsHistory, getFieldHistory, saveVitals } from '../controllers/patientVitalsController';

const router = Router();

router.use(protect, authorize('patient'));
router.get('/',               getVitals);
router.get('/history',        getVitalsHistory);
router.get('/history/:field', getFieldHistory);
router.post('/',              saveVitals);

export default router;
