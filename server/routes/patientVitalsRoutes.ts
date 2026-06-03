import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { getVitals, getVitalsHistory, saveVitals } from '../controllers/patientVitalsController';

const router = Router();

router.use(protect, authorize('patient'));
router.get('/',         getVitals);
router.get('/history',  getVitalsHistory);
router.post('/',        saveVitals);

export default router;
