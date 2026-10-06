# Security scope

Atlas is a local portfolio demonstration. Public demo passwords and a mock downstream token make it easy to run. Keep the supplied Docker deployment bound to the local computer. Hosting it for external users requires a separate security design and deployment review.

## Implemented controls

| Area | Control | Practical limit |
| --- | --- | --- |
| Passwords | Per-user random salt and scrypt-derived hashes; timing-safe comparison | Demo passwords are deliberately public |
| Sessions | Random opaque token; only its digest stored; eight-hour expiration | No SSO, MFA or account-management UI |
| Cookies | HttpOnly, SameSite=Strict; Secure supported for HTTPS mode | Local HTTP does not use a Secure cookie |
| Login abuse | Failed-login throttling by source address | In-memory counters reset on restart; proxy policy needs review |
| Mutations | Required `X-Atlas-Request: true` header and origin/Host checks | Real proxy/Host policy needs review |
| Authorization | Server roles and independent-approval policy | Fixed demonstration roles |
| Input | Body/import limits, field allowlists, constrained identifiers and format validation | Not an arbitrary file-processing service |
| File adapters | XML DTD/entity declarations rejected; CSV formula-leading values escaped on export | Supported Atlas schema only |
| SQL | Bound values for user data | Database-file owner remains trusted |
| Browser rendering | User text rendered as text; no external runtime assets | Browser extensions are outside the threat boundary |
| Browser headers | Content Security Policy, frame denial, no-referrer and nosniff | Real proxy/TLS deployment needs separate validation |
| Revision safety | Required current version for mutation; stale writes rejected | Users must resolve conflicting edits |
| Audit | Transactional events; SQLite triggers reject update/delete | A database owner can remove triggers or alter files |
| Integration | Internal bearer credential, bounded timeout, acknowledgement validation, idempotency | Mock ERP is not an enterprise trust boundary |

Inspect code and tests for the exact behavior at the commit under review. These controls reduce specific risks; the repository is not an audited enterprise security product.

## Threat examples

| Threat | Response | Remaining work for production |
| --- | --- | --- |
| Forged browser mutation | Strict cookies, custom request header, origin validation | Enterprise CSRF/origin review behind real proxy topology |
| Steward approving their own change | Creator and last-editor exclusion enforced in domain | Organization identity and delegation policy |
| Lost update | Optimistic version checks | Conflict-resolution UX for larger records |
| Duplicate or partially imported catalog | Identity constraints and atomic bounded batches | Vendor schema governance and quarantine storage |
| Receiver outage or lost acknowledgement | Durable outbox and persistent receiver deduplication | Monitoring, leases and reconciliation jobs |
| Tampered browser field | Server allowlist and role checks | Broader penetration testing |
| Database-file theft | Protect host and volume access | Encryption, managed secrets and backup retention controls |

## Production work deliberately out of scope

Use SSO/MFA, user provisioning, HTTPS, secret rotation and external secret storage. Add account recovery and session revocation workflows, immutable off-host audit retention, centrally collected logs, alerting and measured backup recovery. Define data ownership, retention and real ERP/MDM schema agreements. Assess dependency and container updates continuously. Implement distributed job claiming before increasing worker replicas.

Disabling demo mode is not a conversion to a production deployment. Non-demo startup rejects a demo-provisioned database, requires `SEED_DEMO=false` and a non-default `ERP_TOKEN` of at least 32 characters. New identity provisioning needs `ADMIN_PASSWORD` of at least 16 characters. Use a fresh database and deliberate identity provisioning; changing an environment flag does not remove old demo identities. These startup guards do not provide SSO, HTTPS or the other production controls above.

## Sensitive material

Only fictional catalog data is supplied. Real supplier contracts, employer records, access tokens, production URLs, cookies and database backups must stay out of Git and issue attachments. Use the root [security reporting policy](../SECURITY.md) for a vulnerability.
