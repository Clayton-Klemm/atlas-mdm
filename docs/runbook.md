# Operations runbook

This runbook applies to the local Atlas demo with one application process and one mock ERP. Record the commit, time, affected product/job IDs and observations before changing state. Do not include cookies, passwords or tokens in a ticket.

## Start, inspect and stop

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 erp
docker compose down
```

The app is available at [http://localhost:8080](http://localhost:8080). The receiver is an internal dependency and is inspected through the Integrations view. SQLite persists in named volumes. Stopping containers does not remove those volumes.

For local development, use Node.js 24, `npm ci` and `npm run dev`; both processes start together. The local application database defaults to `data/atlas.sqlite`.

## Health and observability

| Endpoint / view | Meaning | Action |
| --- | --- | --- |
| `/health/live` | HTTP process responds | Check process/container if unavailable |
| `/health/ready` | Database check succeeds | Check volume permissions, capacity and database state if failing |
| `/metrics` | Operational counters and gauges | Compare job backlog and errors over time |
| Integrations | Persistent job state, attempts and last error | Triage Retry/DeadLetter jobs |
| Audit | Record-level changes and operator replay | Correlate workflow and integration actions |
| Container logs | Structured events, HTTP status and request IDs | Match a failed request to its response request ID |

Readiness does not prove ERP availability. A healthy app may queue deliveries during a receiver outage. In-memory counters restart with the process; persisted job state is the recovery source of truth. The demo does not include an external alerting service.

## Incident triage

| Symptom | Likely area | Safe first response |
| --- | --- | --- |
| Browser cannot connect | Startup, host port or Docker engine | Check `docker compose ps` and app logs; confirm port 8080 is free |
| Login fails | Credentials, expired session or old data | Use the documented demo account; sign out/in; inspect 401 response |
| Submission blocked | Data quality | Correct the displayed field issues in Draft |
| HTTP 409 on save | Stale version or duplicate identity | Refresh and compare edits; do not blindly overwrite |
| Approval forbidden | Role or separation of duties | Use a reviewer who is neither creator nor last editor |
| Import rejected | Format, schema, duplicate or size | Preview the sample; inspect row errors; keep the batch at 100 records or fewer |
| Delivery retries | Receiver outage, timeout or rejected mapping | Inspect last error, receiver health/logs and payload contract |
| DeadLetter job | Attempts exhausted | Correct the underlying issue, then use admin Retry |

Escalate schema/mapping changes, cross-system discrepancies, unexplained audit gaps or suspected credential exposure for review. A retry should not be used to hide a deterministic mapping failure.

## Delivery recovery

1. Sign in as `admin` and open Integrations. Capture the job ID, source version, attempts and error.
2. Confirm the mock receiver is running and the failure-injection control has returned to zero.
3. For Retry, the worker normally resumes automatically. A job reaches DeadLetter after its configured attempt budget.
4. Choose Retry after the underlying failure is resolved. It reuses the original payload and idempotency key and writes an operator audit event.
5. Confirm Delivered and verify the material in the downstream list. If a concurrent delivery cycle is running, wait for it to finish before retrying.

Do not edit a published snapshot to "fix" a delivery. Reopen the product, make the intended correction, submit for independent approval and publish a new revision.

## Application backup

The backup command creates a consistent SQLite backup, including products, audit, jobs, users and sessions. Prefer it to copying a live SQLite main file, which can omit committed WAL data.

Local:

```sh
npm run backup -- --output data/backups/atlas.sqlite
npm run verify:backup
```

Docker:

```sh
docker compose run --rm app npm run backup -- --output data/backups/atlas.sqlite
docker compose run --rm app npm run verify:backup
```

The Docker backup lives inside the application's data volume. Copy a backup to separate storage before deleting that volume; a backup in the same volume does not protect against volume loss. For an off-volume copy:

```sh
docker compose cp app:/app/data/backups/atlas.sqlite ./atlas-backup.sqlite
```

Protect backups like application data: they include password hashes, audit records and session state. Do not commit them to GitHub.

## Restore

Restoring replaces the active application's database. Keep a copy of the current database before beginning and stop the app so no writes or deliveries race with restoration.

For local development, stop `npm run dev`, then run:

```sh
npm run restore -- --input data/backups/atlas.sqlite
npm run dev
```

The restore helper validates the backup and uses SQLite's backup API to restore `data/atlas.sqlite`. The equivalent manual operation is replacing the stopped application's `data/atlas.sqlite` with the backup and ensuring old `-wal`/`-shm` files are absent. Prefer the helper so SQLite manages the destination correctly.

For Docker, the backup file must be in the application data volume:

```sh
docker compose stop app
docker compose run --rm app npm run restore -- --input data/backups/atlas.sqlite
docker compose up -d app
docker compose ps
```

Verify readiness, catalog counts and a known audit event after recovery. Review jobs created after the backup: they may have been lost from Atlas even if the receiver accepted them. Reconcile both sides before republishing data.

The application backup does **not** include the mock ERP's separate persistence. Keep receiver state when rehearsing an app restore. Recovering both services in a real deployment would require coordinated backups and reconciliation; the demo does not claim cross-system point-in-time recovery.

## Disaster recovery rehearsal

Run `npm run verify:backup` after changing storage or backup code. It uses separate temporary files so the main demo database remains intact. Save its actual result with the commit in a release/ticket; do not infer success from the existence of a backup.

For a manual rehearsal, record source counts and an audit event, create a backup, stop the app, restore, restart, check readiness and compare the same records. Confirm Pending/Retry jobs resume against the preserved receiver. Record elapsed recovery time and any discrepancies. Recovery-point and recovery-time targets for this portfolio are illustrative and must be agreed and measured before an enterprise deployment.

## Reset the demo

For a fresh seed, remove the named volumes only when you are comfortable losing all demo edits, imports, audit history and receiver records:

```sh
docker compose down -v
docker compose up --build -d
```

## Release rollback

Capture the currently deployed commit/image and an application backup before a change. Stop the app, check out the known-good commit, rebuild and restart. If the release changed the database schema incompatibly, restore the pre-release backup with the app stopped before starting the old version. Review ERP acknowledgements since the backup to avoid losing delivery intent. See [change control](change-control.md) for the release checklist.
