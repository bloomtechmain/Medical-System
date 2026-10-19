import { Router } from 'express';
import { body } from 'express-validator';
import { protect } from '../middleware/auth';
import validate from '../middleware/validate';
import { requestJoin, requestRemove, listMine, listForOrg, respond, cancel } from '../controllers/orgMembershipRequestController';

const router = Router();
router.use(protect);

router.post('/join',
  body('organization_id').isInt(),
  body('message').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('proposed_schedule').optional({ nullable: true }).isArray({ max: 7 }),
  validate,
  requestJoin
);

router.post('/remove',
  body('organization_id').isInt(),
  body('doctor_id').isInt(),
  body('message').optional({ nullable: true }).isString().isLength({ max: 500 }),
  validate,
  requestRemove
);

router.get('/mine', listMine);
router.get('/org/:organizationId', listForOrg);

router.post('/:id/respond',
  body('decision').isIn(['accept', 'decline']),
  validate,
  respond
);

router.delete('/:id', cancel);

export default router;
