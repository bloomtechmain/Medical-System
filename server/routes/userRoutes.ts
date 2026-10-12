import { Router } from 'express';
import { body } from 'express-validator';
import { getAll, getOne, getOneWithProfile, update, updateWithProfile, updateMyProfile, getMyOrganizations, joinOrganization, leaveOrganization, toggleActive, remove, getStats, searchPatients, searchPharmacists, searchLaboratories, searchDoctors } from '../controllers/userController';
import { protect, authorize } from '../middleware/auth';
import validate from '../middleware/validate';
import { searchLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/stats',        protect, authorize('admin'),                                getStats);
router.get('/patients',     protect, authorize('admin', 'doctor', 'laboratory'), searchLimiter, searchPatients);
router.get('/pharmacists',  protect, authorize('admin', 'doctor', 'patient'),    searchLimiter, searchPharmacists);
router.get('/laboratories', protect, authorize('admin', 'doctor', 'patient'),    searchLimiter, searchLaboratories);
router.get('/doctors',      protect, authorize('admin', 'laboratory', 'patient'), searchLimiter, searchDoctors);
router.put('/me/profile',   protect,                                                   updateMyProfile);
router.get('/me/organizations',                 protect, getMyOrganizations);
router.post('/me/organizations',                protect, joinOrganization);
router.delete('/me/organizations/:organizationId', protect, leaveOrganization);

router.use(protect, authorize('admin'));
router.get('/', getAll);
router.get('/:id/profile', getOneWithProfile);
router.get('/:id', getOne);
router.put('/:id/profile', updateWithProfile);
// PRO-06 point 6: role was accepted from the admin unchecked — only the
// database CHECK stopped a bad value, and it did so as a raw 500.
router.put('/:id',
  [
    body('name').trim().notEmpty().isLength({ max: 150 }),
    body('email').isEmail().isLength({ max: 254 }).normalizeEmail(),
    body('role').isIn(['patient', 'doctor', 'pharmacist', 'laboratory', 'admin']),
    body('is_active').isBoolean(),
  ],
  validate,
  update
);
router.patch('/:id/toggle', toggleActive);
router.delete('/:id', remove);

export default router;
