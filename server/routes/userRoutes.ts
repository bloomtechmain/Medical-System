import { Router } from 'express';
import { getAll, getOne, getOneWithProfile, update, updateWithProfile, updateMyProfile, getMyOrganizations, joinOrganization, leaveOrganization, toggleActive, remove, getStats, searchPatients, searchPharmacists, searchLaboratories, searchDoctors } from '../controllers/userController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.get('/stats',        protect, authorize('admin'),                                getStats);
router.get('/patients',     protect, authorize('admin', 'doctor', 'laboratory'),       searchPatients);
router.get('/pharmacists',  protect, authorize('admin', 'doctor', 'patient'),          searchPharmacists);
router.get('/laboratories', protect, authorize('admin', 'doctor', 'patient'),          searchLaboratories);
router.get('/doctors',      protect, authorize('admin', 'laboratory', 'patient'),      searchDoctors);
router.put('/me/profile',   protect,                                                   updateMyProfile);
router.get('/me/organizations',                 protect, getMyOrganizations);
router.post('/me/organizations',                protect, joinOrganization);
router.delete('/me/organizations/:organizationId', protect, leaveOrganization);

router.use(protect, authorize('admin'));
router.get('/', getAll);
router.get('/:id/profile', getOneWithProfile);
router.get('/:id', getOne);
router.put('/:id/profile', updateWithProfile);
router.put('/:id', update);
router.patch('/:id/toggle', toggleActive);
router.delete('/:id', remove);

export default router;
