# Suspected patient-data exposure

**Always Sev1**, even for a single record. The reporting clock starts when the
breach is discovered, not when it is confirmed, so the first hour is about
containment and evidence — not about deciding whether it "really counts".

> **This runbook does not contain legal advice.** COMP-01 (which laws apply)
> is still an open question and needs a lawyer's answer. The `.lk` domains,
> Sri Lankan organisations and Sinhala translation point at Sri Lanka's
> Personal Data Protection Act, which carries a notification duty with a
> deadline. **Fill in the two blanks below before go-live** — doing it during
> an incident is too late.
>
> - Regulator to notify: `__________________` Deadline: `______ hours`
> - Lawyer / DPO contact: `__________________`

## First 15 minutes: contain

Do these in parallel if more than one person is available.

1. **Do not delete anything.** Not logs, not the offending record, not an
   access grant. Deleting evidence is its own problem, and `audit_log` is
   append-only precisely so it survives this moment.
2. **Revoke the access path.** Pick the narrowest action that stops it:
   ```sql
   -- A specific account: deactivate. Also revokes its refresh tokens
   -- (do it through the admin UI, or the API, so that happens).
   UPDATE public.users SET is_active = FALSE WHERE id = <user_id>;

   -- Kill every outstanding session for that user immediately.
   UPDATE public.refresh_tokens SET revoked_at = NOW()
   WHERE user_id = <user_id> AND revoked_at IS NULL;

   -- An over-broad consent grant.
   UPDATE clinical.data_access_requests SET status = 'declined'
   WHERE id = <request_id>;
   ```
   Access tokens live 15 minutes, so revoking refresh tokens closes the session
   within that window. If you need it closed *now*, rotate `JWT_SECRET` — this
   logs out every user on the platform (there is no two-key support, SEC-10).
   That is a deliberate, disruptive choice; make it consciously.
3. **If files are exposed**, check whether the bucket or an object is public:
   ```bash
   aws s3api get-public-access-block --bucket "$AWS_S3_BUCKET"
   aws s3api get-bucket-policy        --bucket "$AWS_S3_BUCKET"
   ```
   Files are meant to be reachable only through authenticated,
   ownership-checked endpoints (SEC-28). A publicly readable bucket is an
   exposure by itself, whether or not anyone used it.
4. **Note the time** you were told and what you were told, verbatim.

## Next: establish scope from the audit log

`public.audit_log` (MON-12) exists for this. The three questions, in order:

```sql
-- 1. What did this account do, and when?
SELECT occurred_at, action, target_type, target_id, patient_user_id,
       outcome, host(ip_address) AS ip, request_id, metadata
FROM public.audit_log
WHERE actor_id = <user_id>
ORDER BY occurred_at DESC;

-- 2. Which patients' records did it actually open? This is the list that
--    determines who has to be notified.
SELECT DISTINCT patient_user_id
FROM public.audit_log
WHERE actor_id = <user_id>
  AND action = 'patient_record.viewed'
  AND outcome = 'success'
  AND occurred_at >= '<start-of-window>';

-- 3. Was it probing? Denied views mean someone was trying ids that were not
--    theirs — a strong signal of intent rather than accident.
SELECT occurred_at, patient_user_id, metadata
FROM public.audit_log
WHERE actor_id = <user_id> AND outcome = 'denied'
ORDER BY occurred_at;

-- Everything that touched one patient, from any account (a data-subject
-- request will ask exactly this).
SELECT occurred_at, actor_id, actor_role, impersonated_by, action, outcome
FROM public.audit_log
WHERE patient_user_id = <patient_id>
ORDER BY occurred_at DESC;
```

Check `impersonated_by` on every row. A non-null value means an admin was
acting as that user, and the admin is the real actor.

**Where the log will not help.** It covers logins, privilege changes,
deletions and patient-record views. It does not record every individual read of
every clinical table. If the exposure was through a path with no audit entry,
say so explicitly in the report rather than implying a clean bill — and add the
missing entry afterwards.

Also preserve, before anything rotates them out:

```bash
# JSON logs, filtered to the actor. Save to a file — do not rely on the
# platform's retention, which is unconfirmed (MON-11).
# Railway → service → Logs → export, or via the CLI.
```

## Then: decide and notify

1. **Write down what you know**: what data, how many patients, which accounts,
   what window, how it happened, whether it is now closed. Separate *confirmed*
   from *suspected* — the report will be read as if every sentence is certain.
2. **Contact the lawyer/DPO** named above. They decide what is notifiable, and
   the notification deadline is theirs to track, not yours.
3. **One communicator** (INC-04) handles users and the regulator. Everyone else
   keeps working the incident. Do not let individual engineers message affected
   users.
4. **Rotate anything that may have leaked** — `JWT_SECRET`, database
   credentials, S3 keys, SMTP credentials. If a secret was in a log, a repo or
   a screenshot, treat it as compromised. The variable store for each
   environment is in [../docs/environments.md](../docs/environments.md).

## Afterwards

- Post-incident review (INC-06), on the mechanism, not the person.
- Add the check that would have caught it. If the audit log had no entry for
  the path that was abused, add one — that is a code change and it is the most
  valuable output of the whole incident.
- If this was a data-subject access or deletion request rather than a breach,
  it is a different process: see `docs/data-retention.md` and COMP-03.
- Record it in the personal-data inventory (`docs/personal-data-inventory.md`)
  if the exposure revealed a data flow that is not documented there.
