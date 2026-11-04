# AWS Option A — Lean Production Plan (Suwela / CoreHealth)

_Prepared 2026-11-02. Prices are AWS on-demand estimates for the Mumbai region (`ap-south-1`), in USD, **excluding tax** (VAT/GST depending on billing country). The actual bill is in the AWS console → **Billing → Bills**. See also [`AWS_INFRASTRUCTURE_AND_COSTS.md`](AWS_INFRASTRUCTURE_AND_COSTS.md) for the full inventory of the current setup._

---

## 1. Goal

Run Suwela in production for the **initial user base (10–50 users)** at the **lowest monthly cost** while keeping:

- medical data safe (managed database, automatic backups, point-in-time restore),
- the system smooth for everyday use,
- a clear, no-migration path to scale up as users grow.

---

## 2. Option A architecture

```
Users
  │
  ▼
Cloudflare (free DNS + HTTPS proxy)
  ├── www / app / dashboard.suwela.com ──► CloudFront ──► S3 (website files)
  └── api.suwela.com ───────────────────► 1 × EC2 server (API in Docker, run by ECS)
                                                 ├──► RDS PostgreSQL (managed database)
                                                 └──► S3 (uploaded reports / files)
```

- **One** EC2 server runs the API container (ECS restarts it automatically if it crashes).
- **One** managed RDS PostgreSQL database with automatic daily backups.
- Website served from S3 through CloudFront (practically free at this size).
- The server sits in a public subnet behind a strict firewall (only Cloudflare/HTTPS in, SSH closed) — so **no NAT Gateway** and **no Load Balancer** are needed.
- **Staging is not kept running 24/7** — it is brought up only when needed (or deleted, with a final database snapshot kept).

---

## 3. Option A monthly cost

| # | Service | Size | Monthly cost |
|---|---|---|---|
| 1 | EC2 server (API) | t3.micro — 2 vCPU, 1 GB RAM + 2 GB swap | $8.20 |
| 2 | Server disk | 30 GB gp3 | $2.75 |
| 3 | Public IPv4 address | 1 | $3.65 |
| 4 | RDS PostgreSQL 16 | db.t4g.micro — 2 vCPU, 1 GB RAM (smallest) | $17.50 |
| 5 | Database storage | 20 GB gp3, 7-day automatic backups included | $2.65 |
| 6 | S3 (website + uploads) | a few GB | $0.50 |
| 7 | CloudFront | within always-free 1 TB/month | $0.00 |
| 8 | ECR (Docker images, keep last 5) | ~1–2 GB | $0.20 |
| 9 | Secrets Manager | 2 secrets | $0.80 |
| 10 | CloudWatch Logs | 14-day retention | $1.00 |
| 11 | Data transfer out | within free 100 GB/month | $0.00 |
| 12 | HTTPS certificates (ACM) + Cloudflare DNS | | $0.00 |
| | **Total** | | **≈ $37 / month** (≈ LKR 11,000) |

**Further saving (after the first month, once sizing is confirmed):** a 1-year, no-upfront Savings Plan (EC2) + Reserved Instance (RDS) brings this to **≈ $27–30 / month**.

---

## 4. Current plan vs Option A

### 4.1 Resources

| Item | Current setup | Option A |
|---|---|---|
| Production API servers (EC2) | 3 × t3.small | **1 × t3.micro** |
| API containers | 2 | **1** |
| Load Balancer (ALB) | 1 (prod) + 1 (staging) | **None** |
| NAT Gateway | 1 (prod) + 1 (staging) | **None** |
| Public IPv4 addresses | 6 | **1** |
| Production database | RDS db.t4g.small | **RDS db.t4g.micro** |
| Staging environment | Full copy, running 24/7 | **Off** (on demand / deleted) |
| Website (S3 + CloudFront) | Yes | Yes (unchanged) |
| Uploads (S3) | Yes | Yes (unchanged) |
| Automatic DB backups (7 days) | Yes | Yes (unchanged) |
| CI/CD (GitHub Actions + Terraform) | Yes | Yes (sizes changed only) |

### 4.2 Monthly cost

| Item | Current setup | Option A |
|---|---|---|
| EC2 servers | ~$98 | ~$11 |
| RDS databases | ~$57 | ~$20 |
| NAT Gateways | ~$84 | $0 |
| Load Balancers | ~$40 | $0 |
| Public IPv4 | ~$22 | ~$4 |
| S3, CloudFront, ECR, Secrets, Logs | ~$9 | ~$2.50 |
| **Total** | **~$310 / month** | **~$37 / month** |
| **Per year** | **~$3,720** | **~$444** |

**Saving: ≈ $273 / month (≈ 88%), ≈ $3,276 / year.**

---

## 5. What we lose by moving to Option A

| What is lost | Impact | Is it acceptable at 10–50 users? |
|---|---|---|
| **High availability of the API** (2 containers on separate servers → 1) | If the server or container crashes, the API is down ~1–3 minutes while ECS restarts it. | ✅ Yes — rare, short, and users can retry. |
| **Zero-downtime deployments** (no Load Balancer) | Each deploy causes ~30–60 seconds of downtime. | ✅ Yes — deploy at night / low-usage hours. |
| **Private-subnet servers** (NAT removed) | The server has a public IP instead of hiding behind a NAT. | ✅ Yes — the firewall allows only HTTPS from Cloudflare, SSH closed; access via AWS SSM only. |
| **Memory headroom** (2 GB → 1 GB RAM per server) | Reading very large scanned PDF reports (OCR) may be slower; heavy simultaneous OCR could hit memory limits. | ✅ Yes — 2 GB swap added; OCR runs as a background job, one at a time. Upgrade to t3.small (+$8) if it becomes slow. |
| **Database capacity** (small → micro, 2 GB → 1 GB RAM) | Fewer simultaneous connections and less cache; heavy reports/queries slower. | ✅ Yes — more than enough for 50 users. |
| **Always-on staging** | No permanent test environment matching production. | ✅ Yes — test locally; start staging from Terraform only before big releases. |
| **Load-balancer health checks / traffic shifting** | No automatic routing away from an unhealthy server. | ✅ Yes — ECS health checks still restart an unhealthy container. |

### What we do **not** lose

- ✅ Managed database with **automatic daily backups** and **7-day point-in-time restore**
- ✅ Encrypted database and S3 storage
- ✅ HTTPS everywhere (Cloudflare + ACM)
- ✅ Automatic container restart on crash (ECS)
- ✅ CI/CD pipeline and Terraform — same tools, smaller sizes
- ✅ All application features (OCR, notifications, real-time updates, background jobs)
- ✅ Ability to scale up later **without moving data or changing code**

---

## 6. How Option A handles ~50 users

### 6.1 Capacity check

| Factor | Expected load at 50 users | Option A capacity |
|---|---|---|
| Concurrent users | ~5–15 at the same time | Comfortably handled by 1 container |
| API requests | a few per second at peak | t3.micro handles hundreds/second for this kind of API |
| API memory | ~300–500 MB | 1 GB RAM + 2 GB swap |
| Database connections | ~10–20 | db.t4g.micro supports ~80+ |
| Database size | well under 1 GB in year one | 20 GB storage (auto-grows if enabled) |
| OCR report reading | occasional, background job | runs one at a time in the background queue |
| Real-time (Socket.IO) | single server → no Redis needed | ✅ |

### 6.2 Operating practices that keep it smooth

1. **Deploy during low-usage hours** (e.g. late night Sri Lanka time) to hide the ~30–60 s restart.
2. **Add 2 GB swap** on the EC2 server (protects against short memory spikes during OCR).
3. **CloudWatch alarms (free tier: 10 alarms)** — email alerts for:
   - API container restarted / unhealthy,
   - EC2 CPU > 70% for 15 min,
   - EC2 memory > 80% (CloudWatch agent),
   - RDS CPU > 70%, free storage < 3 GB, connections > 60.
4. **AWS Budget alert** at $45 and $60 / month so cost surprises are caught early (free).
5. **Keep a manual DB snapshot before every risky release** (migrations).
6. **Uptime check** on `https://api.suwela.com/api/ready` (e.g. a free external monitor) to get notified if the site is down.
7. **ECR lifecycle policy** — keep only the last 5 images.
8. **Log retention 14 days** to keep CloudWatch cost near zero.

---

## 7. Growth roadmap — what to do as users increase

Each step is a **size/setting change in Terraform** — no code changes and no data migration.

| Stage | Users (approx.) | Trigger signs | Change | Approx. monthly cost |
|---|---|---|---|---|
| **1 — Start (Option A)** | 10–50 | — | 1 × t3.micro + RDS db.t4g.micro | **~$37** |
| **2 — Comfortable** | 50–150 | OCR slow, memory > 80%, swap in use | Server → **t3.small (2 GB)** | **~$45** |
| **3 — Growing** | 150–300 | RDS CPU > 60% at peak, slow pages, connections > 50 | Server → **t3.medium (4 GB)**; DB → **db.t4g.small** | **~$80** |
| **4 — Reliable** | 300–700 | Downtime during deploys becomes a problem; hospitals need uptime commitments | Add **Load Balancer + 2nd server** (zero-downtime deploys, failover); turn on **RDS Multi-AZ** | **~$170** |
| **5 — Scaling** | 700–2,000 | Traffic spikes, OCR queue backlog | **Auto Scaling** (2–4 servers); **Redis (ElastiCache)** for real-time across servers; DB → **db.t4g.medium**; separate worker for OCR jobs | **~$300–400** |
| **6 — Enterprise** | 2,000+ | Hospital contracts, compliance audits, large data | Private subnets + NAT / VPC endpoints, **WAF**, read replica, permanent staging, longer backup retention (35 days), Savings Plans | **$500+** |

### Things to add along the way (when needed, not before)

| When | Add | Why |
|---|---|---|
| Before real patients sign up | **Email (SES or SMTP provider)** | Email verification and password reset ("forgot password") |
| Before real patients sign up | **CloudWatch alarms + Budget alert** | Know about problems and cost before users do |
| ~50+ active users | **1-year Savings Plan / Reserved DB** | ~30% cheaper for the same resources |
| First hospital contract | **RDS Multi-AZ** + longer backups | Survives a data-centre outage; data-protection expectations |
| ~300+ users | **Load Balancer + 2 servers** | Zero-downtime deploys and failover |
| Multiple API servers | **Redis (ElastiCache)** | Real-time notifications across servers (already supported in code) |
| Compliance / audits | **WAF, CloudTrail retention, private subnets** | Security posture hospitals and regulators ask for |
| Regular feature releases | **Staging on a schedule** (e.g. weekday office hours only) | Safe testing without paying 24/7 |

---

## 8. Migration steps from the current setup to Option A

Planned for a low-usage window; expected production downtime **~10–15 minutes**. No data is moved — the database and S3 uploads stay where they are.

1. **Safety first:** take manual snapshots of the production and staging databases.
2. Update Terraform for production:
   - EC2 Auto Scaling group: 3 × t3.small → 1 × t3.micro (public subnet, strict security group, 2 GB swap via user data),
   - ECS service desired count 2 → 1, task memory tuned for 1 GB host,
   - RDS: db.t4g.small → db.t4g.micro (applied in the maintenance window),
   - remove the Application Load Balancer and NAT Gateway; release unused Elastic IPs,
   - point `api.suwela.com` (Cloudflare) at the server, HTTPS via Cloudflare + origin certificate.
3. Update `.github/workflows/deploy.yml` for the single-server deploy (no load-balancer health wait).
4. **Staging:** stop it (keep a final DB snapshot) or delete it; recreate from Terraform when needed.
5. Verify: website (www / app / dashboard), login for every role, report upload + OCR, notifications, `api.suwela.com/api/ready`.
6. Add CloudWatch alarms, a Budget alert, and the ECR lifecycle policy.
7. Update `AWS_INFRASTRUCTURE_AND_COSTS.md` with the new inventory.

**Rollback:** Terraform can restore the previous sizes; the database snapshot from step 1 protects the data.

---

## 9. Summary

| | Current setup | Option A |
|---|---|---|
| Monthly cost | ~$310 | **~$37** |
| Suitable for | thousands of users | **10–50 users (up to ~150 with one upgrade)** |
| Data safety | ✅ | ✅ (same managed DB + backups) |
| Downtime on deploy | none | ~30–60 s |
| Recovery from crash | instant (2nd server) | ~1–3 min (automatic restart) |
| Scale-up effort | — | Terraform size change, no migration |

**Recommendation:** move to Option A now, add alarms + budget alerts, and follow the growth roadmap stage by stage as real usage grows.
