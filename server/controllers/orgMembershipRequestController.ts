import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { logger } from '../config/logger';
import { sendNotification } from '../utils/notify';
import { audit, AuditAction } from '../utils/auditLog';
import { applyWeeklySchedule, isValidScheduleBlock, ScheduleBlock } from './appointmentController';
import { planForSubject, planForOrganization, checkWithinLimit, PlanSubject } from '../utils/plans';
import { sendPlanDenial } from '../middleware/planGate';

// The approval layer in front of organization_members for the doctor<->
// hospital/clinic channeling relationship (migration 013). Two independent
// request kinds share one table because they share the same pending/accepted/
// declined lifecycle and the same two parties, just with the initiator and
// responder swapped:
//
//   join:   doctor requests  -> org owner accepts/declines
//   remove: owner requests   -> doctor accepts/declines
//
// A doctor leaving on their own initiative is NOT this flow — that stays the
// immediate, unilateral delete in userController.leaveOrganization.

const orgName = async (orgId: number): Promise<string> =>
  (await pool.query('SELECT name FROM public.organizations WHERE id=$1', [orgId])).rows[0]?.name || 'the organization';

const userName = async (uid: number): Promise<string> =>
  (await pool.query('SELECT name FROM public.users WHERE id=$1', [uid])).rows[0]?.name || 'A user';

const getOwnerUserId = async (orgId: number): Promise<number | null> => {
  const { rows } = await pool.query(
    "SELECT user_id FROM public.organization_members WHERE organization_id=$1 AND member_role='owner' LIMIT 1",
    [orgId]
  );
  return rows[0]?.user_id ?? null;
};

const isOwnerOf = async (orgId: number, userId: number): Promise<boolean> => {
  const { rows } = await pool.query(
    "SELECT 1 FROM public.organization_members WHERE organization_id=$1 AND user_id=$2 AND member_role='owner'",
    [orgId, userId]
  );
  return rows.length > 0;
};

// Doctor-initiated: "I want to start channeling at this hospital/clinic",
// optionally with the weekly hours they intend to offer there. Nothing in
// organization_members changes until the owner accepts.
const requestJoin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user.role !== 'doctor') { res.status(403).json({ message: 'Only doctors can request to join a hospital/clinic for channeling' }); return; }

    const { organization_id, message, proposed_schedule } = req.body as {
      organization_id?: number; message?: string; proposed_schedule?: ScheduleBlock[];
    };
    if (!organization_id) { res.status(400).json({ message: 'organization_id is required' }); return; }

    if (proposed_schedule !== undefined) {
      if (!Array.isArray(proposed_schedule) || proposed_schedule.some(b => !isValidScheduleBlock(b))) {
        res.status(400).json({ message: 'Invalid proposed schedule' }); return;
      }
    }

    const { rows: org } = await pool.query(
      "SELECT id FROM public.organizations WHERE id=$1 AND is_active=TRUE AND org_type IN ('hospital','clinic')",
      [organization_id]
    );
    if (!org.length) { res.status(404).json({ message: 'Organization not found' }); return; }

    const { rows: existing } = await pool.query(
      'SELECT 1 FROM public.organization_members WHERE organization_id=$1 AND user_id=$2',
      [organization_id, req.user.id]
    );
    if (existing.length) { res.status(409).json({ message: 'You are already affiliated with that organization' }); return; }

    // Migration 014: the doctor's package caps how many hospitals/clinics they
    // channel at, pending requests included.
    const doctor: PlanSubject = { kind: 'user', id: req.user.id, audience: 'doctor' };
    const affiliationDenial = await checkWithinLimit(doctor, await planForSubject(doctor), 'hospital_affiliations');
    if (affiliationDenial) { sendPlanDenial(res, affiliationDenial); return; }

    let request;
    try {
      ({ rows: [request] } = await pool.query(
        `INSERT INTO public.organization_membership_requests
           (organization_id, doctor_id, kind, requested_by, message, proposed_schedule)
         VALUES ($1,$2,'join',$2,$3,$4)
         RETURNING *`,
        [organization_id, req.user.id, message || null, proposed_schedule ? JSON.stringify(proposed_schedule) : null]
      ));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ message: 'You already have a pending request to join that organization' }); return;
      }
      throw err;
    }

    audit(req, { action: AuditAction.ORG_JOIN_REQUESTED, targetType: 'organization', targetId: organization_id,
      metadata: { requestId: request.id } });

    const ownerUserId = await getOwnerUserId(organization_id);
    const doctorName = await userName(req.user.id);
    if (ownerUserId) {
      await sendNotification(ownerUserId, 'org_join_request', 'New Channeling Request',
        `Dr. ${doctorName} has requested to start channeling at your organization.`,
        { request_id: request.id, organization_id, doctor_id: req.user.id });
    }

    res.status(201).json(request);
  } catch (err) { next(err); }
};

// Owner-initiated: "I want to end this doctor's affiliation" — does not touch
// organization_members directly. Exported so organizationTeamController's
// generic member-removal endpoint can route a doctor-member removal through
// here instead of deleting immediately.
const createRemovalRequest = async (
  organizationId: number, doctorId: number, requestedBy: number, message?: string | null
): Promise<{ id: number }> => {
  const { rows: [request] } = await pool.query(
    `INSERT INTO public.organization_membership_requests
       (organization_id, doctor_id, kind, requested_by, message)
     VALUES ($1,$2,'remove',$3,$4)
     RETURNING id`,
    [organizationId, doctorId, requestedBy, message || null]
  );

  const name = await orgName(organizationId);
  await sendNotification(doctorId, 'org_removal_request', 'Channeling Removal Request',
    `${name} wants to end your channeling affiliation. You need to accept before it takes effect.`,
    { request_id: request.id, organization_id: organizationId });

  return request;
};

// Owner-initiated removal, called directly (the dedicated endpoint — the
// same action is also reachable via DELETE /org-team/:orgId/members/:userId
// for a doctor member, see organizationTeamController.removeMember).
const requestRemove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, doctor_id, message } = req.body as {
      organization_id?: number; doctor_id?: number; message?: string;
    };
    if (!organization_id || !doctor_id) { res.status(400).json({ message: 'organization_id and doctor_id are required' }); return; }
    if (!(await isOwnerOf(organization_id, req.user.id))) { res.status(403).json({ message: 'Only the organization owner can request a removal' }); return; }

    const { rows: member } = await pool.query(
      "SELECT 1 FROM public.organization_members WHERE organization_id=$1 AND user_id=$2 AND member_role='doctor'",
      [organization_id, doctor_id]
    );
    if (!member.length) { res.status(404).json({ message: 'That doctor is not affiliated with your organization' }); return; }

    let request;
    try {
      request = await createRemovalRequest(organization_id, doctor_id, req.user.id, message);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ message: 'A removal request for that doctor is already pending' }); return;
      }
      throw err;
    }

    audit(req, { action: AuditAction.ORG_REMOVAL_REQUESTED, targetType: 'user', targetId: doctor_id,
      metadata: { requestId: request.id, organizationId: organization_id } });

    res.status(201).json(request);
  } catch (err) { next(err); }
};

// Every request involving the caller as the doctor — both the join requests
// they made and the removal requests waiting on their decision. One list
// because the doctor-facing UI shows both in the same place.
const listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, o.name AS organization_name, o.org_type AS organization_type
      FROM public.organization_membership_requests r
      JOIN public.organizations o ON o.id = r.organization_id
      WHERE r.doctor_id = $1
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
};

// Every request for an org the caller owns — owner-facing queue.
const listForOrg = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(String(req.params.organizationId), 10);
    if (!(await isOwnerOf(organizationId, req.user.id))) { res.status(403).json({ message: 'Only the organization owner can view this' }); return; }

    const { rows } = await pool.query(`
      SELECT r.*, u.name AS doctor_name, u.email AS doctor_email,
             dp.specialization AS doctor_specialization, dp.license_number AS doctor_license_number
      FROM public.organization_membership_requests r
      JOIN public.users u ON u.id = r.doctor_id
      LEFT JOIN public.doctor_profiles dp ON dp.user_id = r.doctor_id
      WHERE r.organization_id = $1
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
      LIMIT 50
    `, [organizationId]);
    res.json(rows);
  } catch (err) { next(err); }
};

// Accept/decline. Who may respond depends on the request's kind: a 'join'
// request is answered by the org owner, a 'remove' request is answered by
// the doctor it targets — enforced here, not by route-level role gating,
// since both kinds share one endpoint.
const respond = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { decision } = req.body as { decision?: 'accept' | 'decline' };
    if (decision !== 'accept' && decision !== 'decline') { res.status(400).json({ message: "decision must be 'accept' or 'decline'" }); return; }

    const { rows: [request] } = await client.query(
      'SELECT * FROM public.organization_membership_requests WHERE id=$1', [req.params.id]
    );
    if (!request) { res.status(404).json({ message: 'Request not found' }); return; }
    if (request.status !== 'pending') { res.status(409).json({ message: 'This request has already been decided' }); return; }

    if (request.kind === 'join') {
      if (!(await isOwnerOf(request.organization_id, req.user.id))) { res.status(403).json({ message: 'Only the organization owner can decide this request' }); return; }
    } else {
      if (req.user.id !== request.doctor_id) { res.status(403).json({ message: 'Only the affected doctor can decide this request' }); return; }
    }

    // Migration 014: accepting a doctor uses a place on the organisation's
    // panel, which its package caps. Checked before anything is written.
    if (decision === 'accept' && request.kind === 'join') {
      const org = await planForOrganization(request.organization_id);
      const denial = org && await checkWithinLimit(org.subject, org.plan, 'affiliated_doctors');
      if (denial) { sendPlanDenial(res, denial); return; }
    }

    await client.query('BEGIN');
    // The weekly-hours cleanup below touches RLS-protected clinical.* tables
    // as the affected doctor, not the caller (who is the owner, here) —
    // same session-local identity queryAs() would set.
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.role', 'doctor', true)`,
      [String(request.doctor_id)]
    );

    if (decision === 'accept' && request.kind === 'join') {
      await client.query(
        `INSERT INTO public.organization_members (organization_id, user_id, member_role)
         VALUES ($1,$2,'doctor') ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [request.organization_id, request.doctor_id]
      );
    } else if (decision === 'accept' && request.kind === 'remove') {
      await client.query(
        "DELETE FROM public.organization_members WHERE organization_id=$1 AND user_id=$2 AND member_role != 'owner'",
        [request.organization_id, request.doctor_id]
      );
      // The doctor no longer channels here — dangling weekly hours/overrides
      // for this org would otherwise keep showing up as bookable.
      await client.query('DELETE FROM clinical.doctor_weekly_availability WHERE doctor_id=$1 AND organization_id=$2', [request.doctor_id, request.organization_id]);
      await client.query('DELETE FROM clinical.doctor_availability_overrides WHERE doctor_id=$1 AND organization_id=$2', [request.doctor_id, request.organization_id]);
    }

    const { rows: [updated] } = await client.query(
      `UPDATE public.organization_membership_requests
       SET status=$1, responded_by=$2, responded_at=NOW(), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [decision === 'accept' ? 'accepted' : 'declined', req.user.id, request.id]
    );

    await client.query('COMMIT');

    // Applying the proposed schedule touches a different RLS-protected table
    // (clinical.*) via its own dedicated connection — done after COMMIT so a
    // schedule-validation failure can't roll back a membership that already
    // went through; it would just mean the doctor has to set hours manually.
    if (decision === 'accept' && request.kind === 'join' && request.proposed_schedule) {
      try {
        await applyWeeklySchedule(request.doctor_id, request.organization_id, request.proposed_schedule as ScheduleBlock[]);
      } catch (err) {
        // Membership already committed, which is the part that matters — the
        // doctor can still set hours manually from Availability Settings.
        logger.error({ err, requestId: request.id }, 'Failed to apply proposed schedule after join request was accepted');
      }
    }

    audit(req, {
      action: request.kind === 'join' ? AuditAction.ORG_JOIN_DECIDED : AuditAction.ORG_REMOVAL_DECIDED,
      targetType: request.kind === 'join' ? 'organization' : 'user',
      targetId: request.kind === 'join' ? request.organization_id : request.doctor_id,
      metadata: { requestId: request.id, decision },
    });

    const name = await orgName(request.organization_id);
    if (request.kind === 'join') {
      await sendNotification(request.doctor_id,
        decision === 'accept' ? 'org_join_accepted' : 'org_join_declined',
        decision === 'accept' ? 'Channeling Request Accepted' : 'Channeling Request Declined',
        decision === 'accept'
          ? `${name} accepted your channeling request. You can now see patients there.`
          : `${name} declined your channeling request.`,
        { request_id: request.id, organization_id: request.organization_id }
      );
    } else {
      const ownerUserId = await getOwnerUserId(request.organization_id);
      const doctorName = await userName(request.doctor_id);
      if (ownerUserId) {
        await sendNotification(ownerUserId,
          decision === 'accept' ? 'org_removal_accepted' : 'org_removal_declined',
          decision === 'accept' ? 'Removal Accepted' : 'Removal Declined',
          decision === 'accept'
            ? `Dr. ${doctorName} accepted the removal — their channeling affiliation with ${name} has ended.`
            : `Dr. ${doctorName} declined to be removed from ${name}. They remain affiliated.`,
          { request_id: request.id, organization_id: request.organization_id }
        );
      }
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// Withdraw a request before the other party has decided it — the doctor
// cancelling their own join request, or the owner cancelling their own
// removal request.
const cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE public.organization_membership_requests
       SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND requested_by=$2 AND status='pending'`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) { res.status(404).json({ message: 'No pending request found to cancel' }); return; }
    res.status(204).end();
  } catch (err) { next(err); }
};

export { requestJoin, requestRemove, createRemovalRequest, listMine, listForOrg, respond, cancel };
