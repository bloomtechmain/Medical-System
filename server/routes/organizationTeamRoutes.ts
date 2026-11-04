import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { protect } from '../middleware/auth';
import { getMembers, inviteMember, removeMember } from '../controllers/organizationTeamController';
import { organizationSuspended } from '../utils/subscriptions';

const router = Router();

// Confirms the caller is a member_role='owner' of :orgId before letting them
// manage that org's team — org dashboards are role-gated (e.g. any 'doctor'
// can reach /hospital/...), not ownership-gated, so this check lives here.
const requireOwner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM public.organization_members WHERE organization_id=$1 AND user_id=$2 AND member_role='owner'",
      [req.params.orgId, req.user.id]
    );
    if (!rows.length) { res.status(403).json({ message: 'Only the organization owner can manage its team' }); return; }
    // Migration 016: a hospital/clinic dashboard locked for non-payment.
    // (Its other sections use the owner's doctor endpoints, which cannot
    // tell which dashboard they serve — the client locks those.)
    if (await organizationSuspended(Number(req.params.orgId))) {
      res.status(402).json({ code: 'SUBSCRIPTION_EXPIRED', message: "This organization's package has expired and payment is due." });
      return;
    }
    next();
  } catch (err) { next(err); }
};

// Mounted with the ':orgId' path segment (not a bare '/') so Express has
// already parsed req.params.orgId by the time requireOwner runs — a bare
// router.use(requireOwner) here would run before any route's params exist.
router.use('/:orgId', protect, requireOwner);

router.get('/:orgId/members',             getMembers);
router.post('/:orgId/members',            inviteMember);
router.delete('/:orgId/members/:userId',  removeMember);

export default router;
