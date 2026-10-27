# Packages (subscription plans)

Migration `014_subscription_plans.sql`.

## Who is on a package

| Dashboard | Package attaches to | Audience |
|---|---|---|
| Doctor (personal) | `users.plan_id` | `doctor` |
| Pharmacy | `organizations.plan_id` | `pharmacy` |
| Laboratory | `organizations.plan_id` | `laboratory` |
| Hospital | `organizations.plan_id` | `hospital` |
| Clinic | `organizations.plan_id` | `clinic` |
| **Patient** | — | **none: everything is free** |

A pharmacist or laboratory user acts for their organisation, so the
**organisation's** package applies to them. `plan_id` NULL means the
audience's default package (`is_default`). Registration always stores an
explicit id, so only accounts created before migration 014 rely on NULL.

## Where things live

- **Feature catalogue:** `server/config/planCatalog.ts`. This is the list of
  feature keys per audience, each either `boolean` or `limit` (an integer, or
  null for unlimited). The *values* for each package are stored in
  `public.plans.features` and edited from **Admin → Packages**.
- **Resolution and usage counting:** `server/utils/plans.ts`.
- **Route gates:** `server/middleware/planGate.ts`, with `requireFeature(key)`
  and `requireWithinLimit(key)`. A caller with no package (patient, admin)
  always passes, so shared routes stay free for patients.
- **Checks that depend on the request body or on another account's
  package** are in the controllers. These are: confirming an appointment;
  hospital/clinic join requests and acceptances; team invites; and the
  online-booking check on slots and bookings.
- **Client:** the `useDashboardPlan()` hook picks the package for the
  dashboard in the URL. The nav hides sections the package doesn't include,
  `<RequireFeature>` shows an upgrade notice on locked routes, and every
  paid dashboard has a `/<dashboard>/package` page.

A refused request returns `403` with `code: 'PLAN_FEATURE_LOCKED'` or
`'PLAN_LIMIT_REACHED'`, plus the feature key and the package.

## Adding a feature

1. Add it to `FEATURE_CATALOG` in `planCatalog.ts`. Its `fallback` must be
   off/zero, so existing packages don't silently gain it.
2. Enforce it: a gate on the route, or a check in the controller. For a
   limit, add a counter to `COUNTERS` in `utils/plans.ts`; a limit with no
   counter is not enforced.
3. If it hides a dashboard section, map the route in
   `client/src/constants/plans.ts` (`SECTION_FEATURE`) and wrap the route in
   `<RequireFeature>`.
4. Add the label to `client/src/locales/{en,si}/plans.json` under `feature`.
5. Set its value on each package from the admin dashboard.

## Limits of the current design

- **No payments.** A paid package chosen at sign-up is recorded and shown in
  the approval queue. "Request this package" notifies the admins. Money is
  handled outside the system, and an admin assigns the package.
- **Hospital and clinic "section" features are client-side only**
  (`enforcedBy: 'dashboard'`). Those dashboards call the same doctor
  endpoints, so the server can't tell which dashboard a request came from;
  the doctor's own package still governs what the server allows.
- **Downgrades don't delete anything.** An account over a new, lower limit
  keeps what it has, but can't add more until it is back under the limit.
- **Changing the default package** pins accounts that were following the old
  default to it first, so it only affects new sign-ups.
