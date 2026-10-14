# 0002 — Railway now, AWS ECS as the target

**Status:** Accepted; migration planned, not executed
**Date:** 2026-10-14 (recording a decision made earlier)

## Context

The service runs on Railway as two services (API and client) plus managed
PostgreSQL. Railway was chosen because it deploys from a Dockerfile with
almost no configuration, which was the right trade while the product was being
built.

Two things have since changed. The audit found a class of problems that Railway
makes awkward rather than impossible — no infrastructure as code (AUTO-01: the
services, database, variables and domains are all created by hand in the
dashboard), no staging environment (CICD-06), no private network story to
confirm (SEC-11), and uploads on ephemeral container disk (ARCH-06). And the
deployment-readiness work is explicitly AWS-directed: `infra/terraform/` and
`docs/Core-Health-AWS-Architecture.pdf` already describe the target.

## Decision

Stay on Railway for now. Build toward AWS ECS, and make every change in the
meantime work on both.

In practice that means:

- **No Railway-specific behaviour in application code.** Configuration is
  environment variables; `RAILWAY_GIT_COMMIT_SHA` is read only as a fallback
  for the generic `GIT_COMMIT_SHA`.
- **One image, any environment.** The client reads its API URL at runtime from
  `config.js` rather than having it compiled in (ARCH-04), so the same image
  promotes across environments — which is also what ECS needs.
- **Infrastructure as code written ahead of the move.**
  `infra/terraform/` has network, data, compute, iam and edge modules with
  `staging.tfvars` and `production.tfvars`. Never applied; no AWS credentials
  have been used.
- **The deploy pipeline is written platform-agnostically.**
  `.github/workflows/deploy.yml` builds once and promotes by SHA tag; swapping
  Railway's CLI for `aws ecs update-service` is two steps, documented in its
  header.
- **S3 before the move.** `AWS_S3_BUCKET` switches uploads to S3 today, on
  Railway, which both fixes ARCH-06 now and removes a migration step later.

## Consequences

**Accepted while on Railway:** AUTO-01 stays partly open — the dashboard
configuration cannot be fully expressed in `railway.toml`, so
`docs/environments.md` plus `RAILWAY_DEPLOY.md` carry the rest as prose, which
is a weaker guarantee than code. Autoscaling, private networking and
multi-region are not addressed.

**Cost of the dual target:** some work is done twice — Railway health-check
configuration *and* an ALB target group; `railway.toml` *and* Terraform. This
is deliberate and small.

**What it buys:** the move is a configuration change rather than a rewrite, and
AWS-shaped concerns (ephemeral filesystems, multiple instances, a load
balancer in front) are already handled: graceful shutdown, a readiness
endpoint, the Socket.IO Redis adapter, S3 uploads, WebSocket-only transport.

## What would change this

- Railway becoming sufficient — if autoscaling and private networking land
  there, the case for moving weakens considerably.
- A compliance requirement naming a specific region or certification that
  Railway cannot evidence. For health data this is the most likely forcing
  function.
- Cost at scale.

The trigger to actually move is the first real production load, or a
compliance answer from COMP-01 that requires it.
