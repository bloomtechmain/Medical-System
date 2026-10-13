# The application is down or not answering

## 1. Establish what is actually broken (2 minutes)

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://<api-host>/api/health   # process alive?
curl -fsS                                   https://<api-host>/api/ready    # alive AND database reachable?
curl -fsS -o /dev/null -w '%{http_code}\n' https://<client-host>/           # client being served?
```

| `/api/health` | `/api/ready` | Means | Go to |
|---|---|---|---|
| 200 | 200 | API is fine — the problem is the client, DNS or the network | step 4 |
| 200 | 503 | Process up, database unreachable | [database-unreachable.md](database-unreachable.md) |
| fails | fails | Process is down or crash-looping | step 2 |
| times out | times out | Could be DNS, certificate or the platform | step 4 |

The distinction matters because `/api/health` deliberately does not touch the
database — a liveness probe that failed on a database blip would restart a
healthy process and turn a short outage into a crash loop.

## 2. Is it crash-looping?

Railway dashboard → service → **Logs**, and **Deployments** for restart count.

Look for, in order:

- `Missing required environment variable(s): ...` — a variable was removed or
  renamed. The server refuses to start rather than running broken (ARCH-04).
  Fix it in service variables and redeploy. [../docs/environments.md](../docs/environments.md) lists them all.
- `NODE_ENV must be one of: ...` — same class of problem (SEC-21).
- `All DB connection attempts exhausted. Exiting.` — eight attempts with
  growing delay all failed. → [database-unreachable.md](database-unreachable.md)
- `Uncaught exception` / `Unhandled promise rejection` with `"level":"fatal"` —
  a real bug. It is in Sentry with a stack trace and a release tag. If the
  release is the deploy that just went out → [rollback.md](rollback.md).
- OOM kills (the process restarting with no error line of its own) — the
  container memory limit. OCR and PDF extraction are the memory-hungry paths
  (PRO-15); `NODE_OPTIONS=--max-old-space-size=512` assumes a 512MB container.
  If the limit was raised, raise this too.

## 3. Did a deploy cause it?

Compare the first bad timestamp against the last deploy time. If they line up,
stop diagnosing and roll back — [rollback.md](rollback.md). Diagnose afterwards
from the logs, with the service up.

## 4. If both services are healthy but users cannot reach it

- **DNS**: `dig +short <host>` — does it resolve, and to the right place?
- **Certificate**: `curl -vI https://<host> 2>&1 | grep -i expire`. An expired
  certificate is a hard failure in every browser. MON-15/WARN-15 (an expiry
  alert) is still open, so this is a real possibility rather than a formality.
- **Is it only some users?** A WebSocket-only transport is used deliberately
  (INF-11), so a corporate proxy that blocks WebSocket upgrades breaks
  real-time notifications — though not the rest of the app. Check whether the
  reports are "no live updates" rather than "nothing loads".
- **Platform**: check Railway's status page before going further.

## 5. Nothing above explains it

- Restart the service once. If it comes back, you have bought time, not a fix:
  capture the logs from before the restart first, or you lose the evidence.
- If it crash-loops again after a restart, roll back rather than restarting
  repeatedly. `restartPolicyType = "always"` means the platform will keep
  trying indefinitely (INF-06) and keep overwriting the interesting logs.

## Afterwards

Record: when it started, when it recovered, what fixed it, and what would have
told you sooner. The last one is the only part that prevents a repeat. An
outside uptime check (MON-01) and an alert channel that wakes someone (MON-13)
are both still open — if this outage was found by a user telling you, that is
the finding.
