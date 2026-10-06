# Guided demo

Allow about ten minutes. Start the app using the [README](../README.md#run-with-docker), then open [http://localhost:8080](http://localhost:8080). All three accounts use `AtlasDemo!2026`. The data and accounts are fictional.

## 1. Inspect the master data

Sign in as `steward`. **Overview** shows product counts, lifecycle distribution, average quality and delivery backlog. Open **Product catalog** and inspect records across Draft, InReview, Approved and Published.

Notice that a record tracks its supplier, category, source and version. On a fresh seed, open `WIRE-BARE-4` and choose **Submit for review** before correcting it: the server should return specific issues and keep it in Draft. Change its name to `4 AWG bare copper grounding wire`, change its unit to `FT`, and clear its invalid optional GTIN. Save and verify that the quality issues are resolved. If you have already edited the seed, choose another incomplete Draft.

**What to assess:** data modeling, concrete validation feedback and the distinction between an editable Draft and release-ready data.

## 2. Preview supplier onboarding

Open **Import & export**. Select a format, choose **Load sample catalog**, then **Preview & validate**. Review row-level quality results; preview does not create products. Preview the JSON, CSV and XML versions before importing any of them to see the same catalog through different adapters.

Import one sample format as `steward`. The new records arrive as Drafts. Trying to import the identical sample again should report duplicate identities, without creating a partial batch. An import can accept incomplete Drafts, but it cannot skip structural errors or identity conflicts.

**What to assess:** canonical mapping, bounded atomic import, useful errors and support for routine file integrations.

## 3. Submit, review and publish

Choose a complete Draft imported in the previous step, or the corrected Draft from step 1. Submit it. Its status becomes InReview and the audit records the actor and transition.

Sign out and sign in as `reviewer`. Open **Approval queue** and inspect the record. Optionally reject it with a clear reason, then return as `steward` to edit and resubmit. Approve as `reviewer`, then publish the Approved record.

Open Integrations and refresh if needed. The job should progress to Delivered when the receiver acknowledges it. Inspect the downstream material fields and `sourceVersion`. The product's Published status and job's Delivered status answer different questions.

**What to assess:** governed transitions, reasoned review, independent approval and publication without coupling record writes to network availability.

## 4. Observe a receiver failure and recovery

Use another Approved record, or submit/approve another complete Draft. Sign in as `admin` and open **Integrations**. Under **Fail the next ERP requests**, choose `1 request` and click **Configure mock failures**, then publish the Approved product. If you created or last edited a record as admin, switch to the `reviewer` account to approve it first: admin privileges do not bypass the approval-separation rule.

Inspect the new job's attempts and error. A temporary failure produces Retry; the worker backs off and tries again. Refresh to see Delivered after recovery. To inspect exhausted delivery, configure five failures immediately before publication of a new record and wait for the retry budget to reach DeadLetter. Existing pending jobs may consume the injected failures, so begin with an empty backlog.

Return the failure control to zero. As `admin`, Retry a failed job after resolving the simulated outage. The receiver deduplicates the original idempotency key. An operator replay appears in Audit.

**What to assess:** persistent intent, bounded retries, honest failure visibility and controlled operator recovery.

## 5. Review audit and published exports

Open **Audit trail** and filter by the product if desired. Check creation, edits, submission, approval and publication. Changes include before/after data and the actor; seeded history is labeled as demo seed.

Download an export in JSON, CSV or XML. Published products are eligible; Drafts and records awaiting approval remain excluded. Reopen a published product as `steward` to return it to Draft, clear its approval and prepare a new governed revision.

**What to assess:** provenance, release boundaries and practical support documentation.

## Optional technical checks

Run these from the project folder with Node.js 24:

```sh
npm test
npm run check
npm run verify:backup
```

Run the app at least once before `verify:backup` so its database exists. With the app and receiver running, `npm run demo` creates a unique fictional record and checks submission, independent approval, publication, delivery and audit through REST. This command intentionally adds demo data. Tests should be assessed by their actual output for your revision. The [runbook](runbook.md) describes health checks, incident triage and a stopped-app restore. The [API specification](openapi.json) is also served by the app at `/api/spec`.

To inspect version conflict handling, keep a Draft open in two independent browser sessions, save a change in one, then attempt to save the older revision in the other. The stale update should return a conflict; refresh and reconcile instead of losing the first edit.

## Scope to discuss in an interview

Atlas demonstrates an independent design informed by MDM concepts. It does not run Stibo STEP or connect to SAP. Useful follow-up discussions include adapting rules to STEP's object context, agreeing vendor import schemas, qualifying a real ERP contract, separating worker replicas safely and improving identity/audit operations. [Architecture and limits](architecture.md).
