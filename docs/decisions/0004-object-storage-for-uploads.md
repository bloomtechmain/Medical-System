# 0004 — Object storage for uploads, not container disk

**Status:** Accepted
**Date:** 2026-10-14 (recording a decision made earlier)

## Context

Prescriptions, lab reports, referral slips and patient reports are uploaded
files, and they are part of the clinical record — the authoritative copy of
what a doctor wrote or a laboratory produced.

They were written to a directory inside the API container. The audit was blunt
about the consequence (ARCH-06), and the repository's own deploy notes already
said it: **the files are deleted on every redeploy or restart.** On ECS
Fargate, the actual target, each task has its own filesystem, so a file
written by one task is invisible to every other one even while both are
running.

A second, separate problem (SEC-28): the directory was served by
`express.static` *before* any authentication, so anyone with a URL could open
any prescription or lab report without logging in, and the filenames were
guessable.

## Decision

Two changes, both needed; neither is sufficient alone.

**1. Storage.** `server/utils/fileStorage.ts` abstracts the backend. When
`AWS_S3_BUCKET` is set, uploads stream to S3; when it is not, they go to local
disk exactly as before. One code path, chosen by configuration.

Local disk is kept deliberately as the default so local development and CI
need no AWS account. It is **not** acceptable in a deployed environment, and
`docs/environments.md` says so against the variable.

**2. Access.** The static mount is gone. Every file is served by an
authenticated endpoint that checks ownership — `GET
/api/consultations/:id/prescription-file` and equivalents. Filenames get a
random component, and the real content type is verified from the file's magic
bytes rather than trusted from its extension.

A 404 from these endpoints deliberately does not distinguish "no such file"
from "not yours", so they cannot be used to discover which records exist.

## Consequences

**Good:** files survive deploys; multiple instances see the same files (which
is a precondition for running more than one at all — INF-09); access is
checked on every read; a bucket can be versioned and replicated, which is what
makes the uploads half of BKP-08 achievable.

**Costs:**

- Files can no longer be used as plain `<img src>` or `<a href>`, because
  those cannot send an `Authorization` header. The client fetches them and
  creates a blob URL (`src/utils/authedFiles.ts`). This is the single most
  surprising thing for a new contributor, and it is in
  `docs/onboarding.md` for that reason.
- Every file read is now an API request with an ownership check, rather than a
  static file served by the edge. Fine at this scale; if it ever is not, the
  answer is short-lived pre-signed URLs issued *after* the same ownership
  check, not reopening static access.
- Two storage paths exist, so a bug can hide in the one being used less.
  `server/utils/__tests__/fileStorage.test.ts` covers both.

## What would change this

- Serving large files, or many of them, where streaming through the API
  becomes the bottleneck — move to pre-signed URLs with short expiry.
- A requirement to keep the files inside a specific jurisdiction, which is a
  bucket-region decision rather than an architectural one.
- A virus-scanning requirement (PRO-07, still open). Object storage makes that
  easier, not harder: scan on upload notification rather than in the request
  path.
