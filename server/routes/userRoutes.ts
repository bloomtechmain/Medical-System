import { Router } from 'express';
import { getAll, getOne, update, toggleActive, remove, getStats, searchPatients, searchPharmacists, searchLaboratories } from '../controllers/userController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.get('/stats',        protect, authorize('admin'),            getStats);
router.get('/patients',     protect, authorize('admin', 'doctor'),                    searchPatients);
router.get('/pharmacists',  protect, authorize('admin', 'doctor', 'patient'),          searchPharmacists);
router.get('/laboratories', protect, authorize('admin', 'doctor', 'patient'),          searchLaboratories);

router.use(protect, authorize('admin'));
router.get('/', getAll);
router.get('/:id', getOne);
router.put('/:id', update);
router.patch('/:id/toggle', toggleActive);
router.delete('/:id', remove);

export default router;
