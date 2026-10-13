# Uploaded files are missing

Symptom: a prescription, lab report, referral or patient report returns 404 or
an error when opened, but the record pointing at it still exists.

## 1. Which storage backend is this environment using?

This is the whole diagnosis, most of the time.

```bash
# On the API service: is S3 configured?
echo "$AWS_S3_BUCKET"
```

- **Set** → files are in S3 (ARCH-06, PRO-05). Go to step 3.
- **Unset** → files were written to the container's local disk, and **they are
  gone permanently**. Go to step 2.

## 2. Local disk: the files are gone and are not coming back

A container filesystem is ephemeral. Every redeploy, restart and scale event
starts a fresh one. The repository's own deploy notes have said so all along.

There is nothing to recover. What to do:

1. **Set `AWS_S3_BUCKET` and `AWS_REGION` and redeploy.** Until that is done,
   every new upload is on the same countdown.
2. Find what is affected, so patients can be asked to re-upload:
   ```sql
   -- Records that reference a file. Checking which are actually readable
   -- needs the API; this is the candidate list.
   SELECT id, patient_id, visit_date, prescription_file
   FROM clinical.medical_consultations
   WHERE prescription_file IS NOT NULL AND deleted_at IS NULL
   ORDER BY created_at DESC;

   SELECT id, patient_id, status, report_file
   FROM clinical.lab_requests WHERE report_file IS NOT NULL;

   SELECT id, patient_id, title, file_path FROM clinical.patient_reports;
   ```
3. Tell the communicator. Patients and labs will need to re-upload, and that
   is a user-visible request, not a silent fix.

This is not a mystery to investigate — it is the known consequence of running
without object storage. Fixing the configuration is the entire remedy.

## 3. S3: the file should exist

```bash
# Does the object exist?
aws s3 ls "s3://$AWS_S3_BUCKET/" --recursive | grep <filename>

# Can the API's role read it? Run from the task/instance, not your laptop —
# the question is whether the *application's* credentials work.
aws s3api head-object --bucket "$AWS_S3_BUCKET" --key "<key>"
```

| Result | Cause | Fix |
|---|---|---|
| Object listed, API still 404s | IAM permissions, or wrong region/bucket in env | Compare `AWS_REGION`/`AWS_S3_BUCKET` against the bucket; check the task role's policy (`infra/terraform/modules/iam/`) |
| `AccessDenied` | The task role lacks `s3:GetObject` on that prefix | Fix the policy, not the code |
| Object genuinely absent | The upload failed, or it predates S3 being enabled | Step 4 |

## 4. Was it ever uploaded?

Files are served only through authenticated, ownership-checked endpoints
(SEC-28) — `GET /api/consultations/:id/prescription-file` and friends. A 404
from one of those can mean *not allowed* rather than *not found*: the two are
deliberately indistinguishable from outside, to avoid confirming that a record
exists.

So check from the inside before assuming data loss:

- Does the database row have a non-null file column? If it is null, the upload
  never completed — look for the original request in the logs by `requestId`.
- Is the person asking actually entitled to it? A doctor with no treating
  relationship, or a pharmacist from a different pharmacy, gets the same 404 as
  a missing file. That is working correctly.
- Was the record soft-deleted? `deleted_at IS NOT NULL` hides it from reads
  (PRO-25) while the row and file still exist.

## 5. Bulk loss in S3

If many objects are missing at once, this is not an application problem:

- Check the bucket's versioning status. If versioning is on, deleted objects
  have a delete marker and are recoverable:
  ```bash
  aws s3api list-object-versions --bucket "$AWS_S3_BUCKET" --prefix "<prefix>"
  aws s3api delete-object --bucket "$AWS_S3_BUCKET" --key "<key>" --version-id "<delete-marker-id>"
  ```
- Check whether a lifecycle rule is expiring objects. A retention rule written
  for logs and applied to the whole bucket will quietly delete patient
  documents.
- If versioning is off, turn it on now (BKP-08) — that is the control that
  makes this recoverable next time.

## Afterwards

- If the cause was `AWS_S3_BUCKET` unset, the fix is a configuration change,
  and it should be impossible to deploy production without it. Add it to the
  go-live checklist.
- BKP-08 (uploads covered by backup) stays open until bucket versioning or
  cross-region replication is on. Say which one you enabled.
