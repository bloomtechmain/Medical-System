import { Request, Response, NextFunction } from 'express';
import { effectivePlanForUser, checkFeatureEnabled, checkWithinLimit, PlanDenial } from '../utils/plans';

// Subscription packages (migration 014): route-level enforcement.
//
// Both gates resolve the plan from the authenticated user. A user who is not
// subject to plans — a patient, an admin — passes straight through, which is
// what keeps the patient side free: routes shared between patients and
// doctors (creating a consultation, ordering a lab test) can carry a gate
// without ever restricting the patient half of them.
//
// A refusal is a 403 with a machine-readable `code`, so the client can show
// an upgrade prompt instead of a generic error.

export const sendPlanDenial = (res: Response, denial: PlanDenial): void => {
  res.status(denial.status).json(denial.body);
};

/** Refuses the request unless the caller's plan has this boolean feature switched on. */
export const requireFeature = (key: string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const effective = await effectivePlanForUser(req.user);
      if (!effective) { next(); return; }
      const denial = checkFeatureEnabled(effective.subject, effective.plan, key);
      if (denial) { sendPlanDenial(res, denial); return; }
      next();
    } catch (err) { next(err); }
  };

/**
 * Refuses the request when it would take the caller past this limit. Place it
 * BEFORE any upload middleware, so a request that will be refused does not
 * first store, scan and account for a file.
 */
export const requireWithinLimit = (key: string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const effective = await effectivePlanForUser(req.user);
      if (!effective) { next(); return; }
      const denial = await checkWithinLimit(effective.subject, effective.plan, key);
      if (denial) { sendPlanDenial(res, denial); return; }
      next();
    } catch (err) { next(err); }
  };
