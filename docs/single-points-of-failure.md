# Single points of failure

Resolves ARCH-07 (`01-architecture-environments.md`): a written list of what
can break this system on its own, and what's already protected against that.
Scoped to the target AWS architecture (see `docs/architecture.md` for the
diagram this refers to), not the current Railway deployment it's replacing.

A "single point of failure" here means: one component breaks, the whole app
goes down — not "this could be faster" or "this could be cheaper."

## Real risks, not yet mitigated

| Risk | What happens if it fails | Status |
|---|---|---|
| **Single NAT Gateway** (one AZ, shared by both private subnets) | EC2 instances in the *other* AZ lose outbound internet — can't pull a new Docker image from ECR, can't reach Secrets Manager or CloudWatch. Already-running traffic through the ALB is unaffected; new deploys and some background operations are not. | Accepted cost tradeoff (§1 of the AWS architecture doc) — not an oversight. Upgrade path: a second NAT Gateway in the other AZ, ~$33/mo more. |
| **Single-AZ RDS** (the default we start with) | The database has no automatic failover — an AZ issue takes it down until manually recovered from backup. | Accepted cost tradeoff for the pre-launch/staging environment. **Must** flip to Multi-AZ before accepting real patient traffic in production. |
| **Single AWS region** (`ap-south-1`) | A region-wide AWS outage takes down everything — compute, database, edge, DNS records still resolve but point at a dead target. | Accepted risk. True of almost any deployment this size; multi-region failover is a large, ongoing cost that isn't justified at current scale. Revisit only if uptime requirements change materially. |
| **GitHub Actions** | Not a runtime failure — the app keeps running — but a fix or urgent patch can't ship until GitHub Actions is back. | Accepted risk, no practical mitigation at this scale. |
| **The domain registrar** (wherever `corehealth.lk` is registered) | Sits outside AWS entirely. If registration lapses or the registrar has an outage, the domain stops resolving — Route 53 being healthy doesn't help if the registrar isn't pointing at it. | Operational risk, not technical — keep auto-renew on and registrar account access documented somewhere more than one person can reach. |
| **Secrets Manager secret rotation** | If the one DB-credentials secret is ever wrong or revoked without a coordinated update, every ECS task fails to connect at once. | Not currently rotated automatically. Low risk at this scale (manual rotation, rare), worth automated rotation only once the team managing this grows. |

## Already redundant — not a risk

Listed so this reads as a complete picture, not just a list of fears:

- **Compute** — 2 EC2 instances across 2 Availability Zones behind the ALB (Auto Scaling Group `min 2 / max 4`). One instance or one AZ failing doesn't take the API down.
- **Load balancing** — the ALB itself is an AWS-managed, multi-AZ service by default — not something we operate or can single-handedly break.
- **DNS** — Route 53 is multi-AZ/multi-region by design.
- **Static frontend** — S3 + CloudFront: S3 is already multi-AZ within the region, and CloudFront's edge network means no single edge location failing affects users elsewhere.
- **File storage** (once ARCH-06's S3 migration is live) — same multi-AZ S3 durability as the frontend bucket, replacing the local-disk setup that had zero redundancy.
- **Container registry** — ECR is a managed, multi-AZ AWS service.
- **RDS backups** — automated daily backups with point-in-time recovery, independent of the Single-AZ/Multi-AZ question above — a bad deploy or bad query can be recovered from even without a failover standby.

## When to revisit this list

This isn't a one-time document — update it whenever the architecture changes:
Multi-AZ RDS goes live, a second NAT Gateway gets added, a new external
dependency (email provider, payment gateway, SMS) is introduced — anything
that adds or removes a "if this breaks, everything breaks" component.
