# Suwela production — lean AWS setup (Option A, t3.small)

**AWS account:** `441658445819`, registered to `production07@bloomtech.lk` (region `ap-south-1`, Mumbai), CLI profile `suwela-prod`.
**Live since:** 2026-11-03 13:58 UTC (switched over from account `336246706489`).
**Monthly budget:** **$46.40 — hard ceiling.** Expected spend ≈ **$44.00**.
The old account (`336246706489`) and `infra/terraform` are being retired; nothing here touches them.

## What it builds and what it costs

| Resource | Size | USD / month |
|---|---|---|
| EC2 `suwela-prod-app` (ECS host: API + HTTPS proxy) | t3.small, standard CPU credits | 16.35 |
| EBS root disk | 30 GB gp3, encrypted | 2.75 |
| Elastic IP (api.suwela.com) | 1 public IPv4 | 3.65 |
| RDS PostgreSQL 16 `suwela-prod` | db.t4g.micro, single-AZ | 17.50 |
| RDS storage | 20 GB gp3, 7-day backups (free up to 20 GB) | 2.65 |
| S3 website + uploads (versioned, 30-day old versions) | a few GB | 0.50 |
| Website (www / app / dashboard / admin): served by the server's HTTPS proxy from the private S3 bucket via the free S3 endpoint, cached by Cloudflare | | 0.00 |
| ECR | 3 newest images kept | 0.10 |
| SSM Parameter Store (DB password, JWT secret, TLS cert) | standard tier | 0.00 |
| CloudWatch logs (7 days) + 8 alarms | within free tier | 0.50 |
| Data transfer out | within free 100 GB | 0.00 |
| ACM certificate, IAM, ECS, VPC + S3 endpoint, SNS email, Budgets, Anomaly Detection | | 0.00 |
| **Total** | | **≈ 44.00** |

Not built, on purpose: CloudFront (optional `enable_cloudfront`; a new account must first be verified by AWS Support, and Cloudflare already caches), load balancer, NAT gateway, staging, Redis, Multi-AZ, Secrets Manager,
Container Insights, Performance Insights, enhanced monitoring, storage autoscaling.
Taxes (VAT/GST) are on top and depend on the billing country.

## Guardrails (guardrails.tf)

* Budget `suwela-monthly-cap` = $46.40: email at 50 / 80 / 100 % actual and 100 % forecast.
* **At 100 % of actual spend AWS automatically stops the server and the database** (site goes
  offline instead of over budget). AWS restarts a stopped RDS instance after 7 days by itself.
* Cost Anomaly Detection: daily email if a service starts costing ≥ $3 unexpectedly.
* Alarms to production07@bloomtech.lk (click the SNS confirmation email once): server down,
  server CPU, CPU credits low, API memory, DB CPU, DB storage, DB memory, DB connections.
* `allowed_account_ids` in versions.tf: Terraform refuses to run against any other account.

## Order of operations

### 0. Account (owner)
1. Create the account with production07@bloomtech.lk; root MFA on; enable *IAM access to
   Billing* (Account settings).
2. Create IAM user `suwela-deployer` (AdministratorAccess for the build; tighten later), access
   key, then on the operator machine: `aws configure --profile suwela-prod` (region `ap-south-1`).
3. `aws sts get-caller-identity --profile suwela-prod` → note the 12-digit account ID.

### 1. Build
```bash
cd infra/lean
echo 'aws_account_id = "<12 digits>"' > prod.auto.tfvars
terraform init
terraform plan -out=tf.plan     # review: only the resources in the table above
terraform apply tf.plan
```
`aws_acm_certificate_validation` waits for step 2's DNS records (up to 2 h): run step 2 while it
waits, or apply with `-target` in two passes.

### 2. Cloudflare (suwela.com zone)
| Record | Type | Value | Proxy |
|---|---|---|---|
| each `acm_validation_records` entry | CNAME | (from output) | DNS only |
| `api` | A | `api_server_ip` | Proxied |
| `www`, `app`, `dashboard`, `admin` | A | `api_server_ip` | Proxied |

SSL/TLS mode: **Full (strict)**. Origin certificate: SSL/TLS → Origin Server → Create
(hosts `*.suwela.com, suwela.com`, RSA, 15 years), then store it:
```bash
aws ssm put-parameter --profile suwela-prod --overwrite --type SecureString \
  --name /suwela/prod/tls/origin_cert --value file://origin.pem
aws ssm put-parameter --profile suwela-prod --overwrite --type SecureString \
  --name /suwela/prod/tls/origin_key  --value file://origin.key
```
(and delete the local copies). A CloudFront alias can exist on only one distribution: the old
account's distribution must drop `www/app/dashboard` before the new one can take them — that is
part of the cut-over window in step 4.

### 3. GitHub (Settings → Secrets and variables → Actions)
Values from `terraform output` — the full list is in the header of `.github/workflows/deploy.yml`.
Then `DEPLOY_ENABLED=true` and run the Deploy workflow (or push to main).

### 4. Data move from the old account (cut-over window, ~30–60 min downtime)
1. Old site read-only (scale old ECS service to 0).
2. `pg_dump -Fc --no-owner --no-acl` of the old database → `pg_restore --no-owner --no-acl`
   into `suwela-prod` (run from the servers over SSM; nothing is exposed publicly). Migrations
   015/016 then run on the next container start.
3. `aws s3 sync` old uploads bucket → `uploads_bucket_name`; compare object counts.
4. Cloudflare records → new account (table above). Test every domain and role.
5. Rollback = point Cloudflare back at the old account (untouched until step 5).

### 5. Retire the old account (after a few days of the new one running cleanly)
Delete everything in `336246706489` (ECS, EC2/ASG, ALBs, NAT gateways, EIPs, RDS + snapshots,
S3, CloudFront, ECR, Secrets Manager, logs, VPCs) — keep one database export on a local disk,
not in AWS — then optionally close the account.

## Growing later
Change `instance_type` (t3.medium ≈ +$16) or `db_instance_class` (db.t4g.small ≈ +$17) and
apply — **only after raising `budget_limit_usd` with the owner's agreement.**
