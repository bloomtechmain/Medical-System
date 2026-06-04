import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { createRequest, respond, getAll, getPatientView, searchPatients, serveLabReportFile } from '../controllers/accessRequestController';

const router = Router();

router.get('/search-patients',                                             protect, authorize('doctor'), searchPatients);
router.get('/patient/:patientId/view',                                     protect, authorize('doctor'), getPatientView);
router.get('/patient/:patientId/lab-report/:labRequestId/file',            protect, authorize('doctor'), serveLabReportFile);
router.get('/',                                                             protect, authorize('doctor', 'patient'), getAll);
router.post('/',                                                            protect, authorize('doctor'), createRequest);
router.patch('/:id/respond',                                               protect, authorize('patient'), respond);

export default router;
