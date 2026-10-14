# Data retention and subject requests

Answers COMP-04 ("No retention periods and no automatic deletion") and the
"no written process" half of COMP-03.

> **The retention periods in the table below are proposals, not settled law.**
> COMP-01 — which statutes apply to this service — is still an open question.
> Health records carry a statutory *minimum* retention period in most
> jurisdictions, and Sri Lanka's rules for medical records and prescriptions
> need a lawyer's confirmation. Until that happens, **the system deletes
> nothing automatically except on an explicit, operator-run command**, which
> is the safe direction to be wrong in: keeping data too long is a privacy
> problem, deleting it too early can be a legal one and is irreversible.
>
> Confirm with legal: `__________________` Date: `__________`

## The conflict to resolve first

COMP-04 names it directly: a legal minimum retention period conflicts with a
hard delete. If a patient asks to be deleted but the record must be kept for
*N* years, both cannot be honoured.

The approach taken here, and the one to confirm with legal advice: **restrict
rather than erase**. On a deletion request the account is deactivated and the
records are soft-deleted — hidden from every read in the application, and the
login no longer works — but the rows survive until the statutory period ends,
at which point the purge removes them for real. The patient gets the practical
effect of deletion; the legal obligation is still met.

## Proposed schedule

| Data | Proposed retention | From when | Why |
|---|---|---|---|
| Clinical records — consultations, prescriptions, lab requests and reports, patient reports, vitals | **Statutory minimum, to be confirmed** (commonly 5–10 years for adults; longer for minors, often to age of majority + N years) | Last entry in the record | Legal minimum; also clinically useful history |
| Uploaded files (prescriptions, lab reports, referrals) | Same as the record that references them | Record deletion | They *are* the clinical record |
| Account and profile (name, email, role, professional details) | While active, then 1 year | Account deactivation | Lets an account be reinstated, and keeps clinical records attributable |
| `audit_log` | **2 years minimum, proposed** | Entry date | Breach investigation and access review. Deliberately longer than a typical incident takes to surface |
| `upload_usage` | 1 year | Entry date | Quota accounting only |
| `refresh_tokens`, `password_reset_tokens` | Until expiry, then 30 days | Expiry | Detecting reuse of a stolen, already-rotated token |
| `impersonation_log`, `impersonation_action_log` | Same as `audit_log` | Entry date | Same purpose |
| `notifications`, chat messages | 1 year | Creation | Transient. PRO-04: these grow without end today |
| `idempotency_keys` | 30 days | Creation | Only useful while a client might retry |
| Soft-deleted rows of any kind | `PURGE_RETENTION_DAYS` (default 90) past `deleted_at`, **or** the statutory minimum if longer | `deleted_at` | Recovery window for an accidental deletion |

## How deletion actually works today

Three stages, which is what makes an accidental deletion recoverable:

1. **Soft delete.** The application sets `deleted_at` and excludes the row
   from every read (`users`, `medicines`, `medical_consultations`,
   `patient_reports`). Deleting a user also deactivates the login and revokes
   every outstanding refresh token, so access stops immediately.
2. **Purge.** `server/scripts/purgeSoftDeleted.ts` removes rows past the
   retention window for real, and deletes their uploaded files from storage
   first — because once the row is gone there is no record of which file
   belonged to it.
3. **Cascade.** Removing a user cascades their clinical rows away via foreign
   keys. The purge script collects lab report and referral files *before* that
   happens, since `lab_requests` has no `deleted_at` of its own and is removed
   by the cascade rather than soft-deleted.

`audit_log` is excluded from all of this on purpose: the application role has
no `DELETE` on it. Trimming it is a deliberate act performed by
`corehealth_migrator`, and the record of who accessed a patient's data
outlives the data itself — which is the point.

### Running the purge

```bash
# Dry run first. Always. It prints what it would delete and changes nothing.
cd server && npx tsx scripts/purgeSoftDeleted.ts

# Then, once the counts look right:
PURGE_RETENTION_DAYS=90 npx tsx scripts/purgeSoftDeleted.ts --execute
```

**This is not automated.** AUTO-06 and PRO-20 are open: there is no scheduled
job runner, so nothing runs this unless a person or a platform cron does.
COMP-04 asks for automatic deletion and that remains outstanding — the
mechanism exists and is tested, the schedule does not. Wiring it to a Railway
cron (or an EventBridge rule on AWS) is the remaining step, and it should not
be done until the retention periods above are confirmed, because an automated
job that deletes records too early cannot be undone.

## Subject requests

A person has the right to a copy of their data, to correction, to deletion
(subject to the above), and to know who accessed their records.

### Self-service, no operator involved

| Request | How |
|---|---|
| Copy of my data | `GET /api/data-export/me` while logged in. Returns account, profile, consultations with prescribed medicines, lab requests, reports, vitals, access grants, appointments, and the access history for their record. Files are listed with a download link rather than embedded — a JSON document with megabytes of base64 PDFs in it is unusable. |
| Who accessed my record | Included in the export above, from `audit_log`. |
| Correct my details | In the application, under Settings. |
| Withdraw a clinician's access | In the application, under Access Requests. |

### Operator-handled

For anything arriving by email to the contact in the Privacy Policy:

1. **Verify identity first.** Acting on an unverified request is itself a data
   breach — the obvious attack is "please email me all of X's records". Do not
   skip this because the request looks legitimate.
2. **Log the request** — what was asked, by whom, when, and how identity was
   confirmed.
3. **For an access request**, have the person use the self-service export
   where possible. It is complete, it is immediate, and it does not require
   an operator to handle patient data.
4. **For a deletion request**, confirm the statutory position for that record
   type before acting. Then soft-delete through the application rather than
   issuing SQL, so the application's own revocation and file handling run.
5. **Respond within the statutory deadline** (to be confirmed — COMP-01).

There is deliberately **no admin "export anyone's data" endpoint**. It would
be a single call that dumps a complete patient record, and the most damaging
thing an abused admin session could do. Operator-handled requests are served
by helping the subject use their own export.

## Still open

| Item | Needs |
|---|---|
| COMP-01 | A lawyer naming the applicable statutes and deadlines |
| COMP-04 | Those periods confirmed, then the purge wired to a scheduler |
| PRO-04 | Retention for `notifications`, messages and vitals is proposed above but not implemented — nothing deletes them today |
| BKP-06 | Backup retention, which has to be consistent with this schedule: a backup holds data the purge has removed from the live database |

That last one matters and is easy to miss. Purging a record from the database
does not remove it from a backup taken beforehand. A deletion request is not
fully honoured until the backups containing it have also aged out, so backup
retention must be *shorter* than, or deliberately reconciled with, the
retention periods above.
