# AWS Infrastructure & Costs — Suwela (CoreHealth)

_Inventory taken 2026-11-02 directly from the AWS account via the AWS CLI. Costs are **estimates** from published Mumbai (ap-south-1) on-demand prices — Cost Explorer currently returns $0 (no billing access / no history yet). The real bill is in the AWS console → **Billing → Bills** (account owner / root login)._

## Account

| Item | Value |
|---|---|
| AWS account ID | `336246706489` |
| Plan | Paid, $0 free credits remaining; standalone (not in an AWS Organization) |
| Region | Mumbai — `ap-south-1` (everything runs here) |
| IAM user used for deploys | `corehealth-deployer` (local CLI profile `corehealth-prod`) |
| DNS | Cloudflare (not Route 53) |
| Domains | `www.` / `app.` / `dashboard.suwela.com` (frontend), `api.suwela.com` (API) |

> On developer machines, always use `AWS_PROFILE=corehealth-prod`. The `default` profile may point at a different AWS account.

## Services in use

Production and staging are two separate copies of the same setup.

| Service | What it does | Production | Staging |
|---|---|---|---|
| **EC2** (t3.small) | Machines that run the API containers | 3 instances | 3 instances |
| **ECS** | Runs/keeps the API containers alive | `production-corehealth` cluster, 2 tasks | `staging-corehealth` cluster, 2 tasks |
| **RDS PostgreSQL 16** | Main database (20 GB gp3, 7-day backups, single-AZ) | `db.t4g.small` | `db.t4g.micro` |
| **Application Load Balancer** | Routes `api.suwela.com` traffic to containers | 1 | 1 |
| **NAT Gateway** | Internet access for private servers | 1 | 1 |
| **Elastic IPs** (public IPv4) | NAT + other public addresses | 6 total | |
| **S3** | Website files + uploaded reports | `production-corehealth-frontend`, `production-corehealth-uploads` | `staging-corehealth-frontend`, `staging-corehealth-uploads` |
| **CloudFront** | CDN serving the web app | `EMCZIL4KNXTQK` | `E3T4EH8VSS7VR2` |
| **ECR** | Docker image registry | `production-corehealth-api` | `staging-corehealth-api` |
| **Secrets Manager** | JWT secret + DB password | 2 secrets | 2 secrets |
| **CloudWatch Logs** | API logs, 14-day retention | `/ecs/production-corehealth-api` | `/ecs/staging-corehealth-api` |
| **ACM** | HTTPS certificates | free | |

**Not used:** ElastiCache / Redis, Lambda, SNS, SES (email), Route 53.

## Estimated monthly cost (USD)

| Item | Production | Staging |
|---|---|---|
| EC2: 3 × t3.small (~$16 each) | ~$49 | ~$49 |
| RDS database + storage | ~$37 | ~$20 |
| NAT Gateway (~$41 each + data) | ~$42 | ~$42 |
| Load balancer | ~$20 | ~$20 |
| Public IPv4 addresses (~$3.65 each) | ~$11 | ~$11 |
| S3, CloudFront, ECR, Secrets, Logs | ~$5 | ~$4 |
| **Total** | **~$165** | **~$145** |

**Overall: roughly $300–320 / month** (≈ LKR 90,000–95,000). With traffic still near zero, this is mostly fixed cost and won't grow much as users arrive.

## Savings opportunities

1. **Staging costs almost as much as production** (~$145/mo) and runs 24/7. Shutting it down when not testing, or removing its NAT Gateway, saves ~$60–140/mo.
2. **Each environment runs 3 EC2 instances but only 2 containers.** Dropping one instance per environment saves ~$32/mo.
3. **NAT Gateways are the single largest line item** (~$84/mo together). Cheaper alternatives exist (a NAT instance, or VPC endpoints for S3/ECR/Secrets Manager).

## Risk

- **The production database is single-AZ.** If that data centre has an outage, the site is down until AWS recovers it. For medical records, enable **Multi-AZ** (~+$35/mo).

## How to get exact figures

1. Sign in to the AWS console as the account owner (root).
2. Open **Billing → Bills** for actual charges.
3. Optional: enable **"IAM user and role access to Billing information"** (Account settings) so Cost Explorer works for the `corehealth-deployer` user, and this file can be updated with real numbers.
