import { Router } from 'express';
import { create, getAll, updateStatus, cancel } from '../controllers/prescriptionAssignmentController';
import { getAll as getMessages, create as createMessage } from '../controllers/prescriptionAssignmentMessagesController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.get('/',              protect, authorize('doctor', 'patient', 'pharmacist'), getAll);
router.post('/',             protect, authorize('doctor', 'patient'),               create);
router.patch('/:id/status',  protect, authorize('pharmacist'),                      updateStatus);
router.patch('/:id/cancel',  protect, authorize('doctor', 'patient'),               cancel);

router.get('/:id/messages',  protect, authorize('patient', 'pharmacist'), getMessages);
router.post('/:id/messages', protect, authorize('patient', 'pharmacist'), createMessage);

export default router;
