import { Router } from 'express';
import { getAll, getMembers, addMember, removeMember, provision, toggleActive, registerOrganization } from '../controllers/organizationController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

// Public — no auth required
router.post('/register', registerOrganization);

router.use(protect, authorize('admin'));

router.get('/', getAll);
router.post('/', provision);
router.get('/:id/members', getMembers);
router.post('/:id/members', addMember);
router.delete('/:id/members/:userId', removeMember);
router.patch('/:id/toggle', toggleActive);

export default router;
