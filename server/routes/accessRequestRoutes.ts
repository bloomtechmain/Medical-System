import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { createRequest, respond, getAll, getPatientView, searchPatients, serveLabReportFile } from '../controllers/accessRequestController';
import { requireFeature } from '../middleware/planGate';

const router = Router();

router.get('/search-patients',                                             protect, authorize('doctor'), requireFeature('patient_records_access'), searchPatients);
router.get('/patient/:patientId/view',                                     protect, authorize('doctor'), getPatientView);
router.get('/patient/:patientId/lab-report/:labRequestId/file',            protect, authorize('doctor'), serveLabReportFile);
router.get('/',                                                             protect, authorize('doctor', 'patient'), getAll);
router.post('/',                                                            protect, authorize('doctor'), requireFeature('patient_records_access'), createRequest);
router.patch('/:id/respond',                                               protect, authorize('patient'), respond);

export default router;
