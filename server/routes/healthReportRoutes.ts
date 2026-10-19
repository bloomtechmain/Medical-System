import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { getMyHealthReport } from '../controllers/healthReportController';

const router = Router();

// The patient's own complete health report, for the downloadable PDF.
//
// Patient-only and own-data-only, deliberately: there is no
// /health-report/:patientId variant. A doctor who needs a patient's history
// already has getPatientHistory, which enforces a treating relationship
// (SEC-17 #6). An endpoint that produced a complete clinical record for an
// arbitrary patient id would be the single most damaging thing an abused
// session could reach, and nothing in the product needs it.
router.use(protect, authorize('patient'));
router.get('/me', getMyHealthReport);

export default router;
