import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import {
  getDoctorSlots, getWeeklyAvailability, setWeeklyAvailability,
  getOverrides, setOverride, deleteOverride,
  createAppointment, getAll, updateStatus,
} from '../controllers/appointmentController';
import { requireFeature } from '../middleware/planGate';

const router = Router();

router.get('/availability/weekly',        protect, authorize('doctor'),          getWeeklyAvailability);
router.put('/availability/weekly',        protect, authorize('doctor'), requireFeature('online_booking'),          setWeeklyAvailability);
router.get('/availability/overrides',     protect, authorize('doctor'),          getOverrides);
router.post('/availability/overrides',    protect, authorize('doctor'), requireFeature('online_booking'),          setOverride);
router.delete('/availability/overrides/:id', protect, authorize('doctor'),       deleteOverride);

router.get('/doctor/:doctorId/slots',     protect, authorize('patient', 'admin'), getDoctorSlots);

router.get('/',                           protect, authorize('doctor', 'patient'), getAll);
router.post('/',                          protect, authorize('patient'),          createAppointment);
router.patch('/:id/status',               protect, authorize('doctor', 'patient'), updateStatus);

export default router;
