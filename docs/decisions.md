# Design decisions and delivery plan

## Decision 1: A small independent application

**Decision:** demonstrate product stewardship and integration in a runnable Node.js application, with no licensed enterprise platform requirement.

**Reason:** a reviewer can inspect and run the project without vendor credentials. JavaScript domain rules, canonical data, file adapters and REST boundaries are visible.

**Tradeoff:** this cannot demonstrate real STEP administration or SAP connectivity. A vendor deployment would need licensed access, platform-specific configuration, organizational standards and a tested integration contract.

## Decision 2: SQLite with explicit transactions

**Decision:** store products, references, audit, sessions and delivery jobs in SQLite. Use transactions for mutations and publish enqueueing.

**Reason:** one local process and a persistent volume provide simple startup and recoverable state. Tests can isolate databases quickly. The database contains inspectable records instead of volatile in-memory demo state.

**Tradeoff:** synchronous database operations and a single file are appropriate to a bounded demo, not a multi-region MDM platform. A larger system would need a database/service design for concurrent workload, managed backups, migration orchestration and capacity testing.

## Decision 3: Incomplete Drafts, strict submission

**Decision:** allow Draft quality issues and block submission until business rules pass.

**Reason:** supplier onboarding frequently needs enrichment. Rejecting every incomplete row would make it hard for stewards to correct incoming data. A strict review boundary prevents incomplete data from quietly moving forward.

**Tradeoff:** a Draft catalog can accumulate poor records; ownership, aging and remediation queues would be useful next steps. Atomic import still rejects structural or identity errors.

## Decision 4: Independent approval and optimistic revisions

**Decision:** the approver must differ from the creator and last editor. Mutations require the expected record version.

**Reason:** administration permissions should not silently erase review accountability, and stale browser tabs should not lose another person's edits.

**Tradeoff:** a single user cannot perform the whole approval cycle. The demo provides separate actors. Complex organizations may need delegated authority, assignment and richer conflict resolution.

## Decision 5: Transactional outbox and receiver deduplication

**Decision:** commit publication and a frozen payload together, then deliver asynchronously with bounded retries and a persistent idempotency key.

**Reason:** a network call cannot share a SQLite commit. Durable intent plus safe replay handles downtime and lost acknowledgements without inventing exactly-once transport.

**Tradeoff:** Published can precede Delivered, and operators need visible job status. The current worker is single-instance; multiple replicas require atomic claiming/leases. Cross-system restore requires reconciliation beyond an application backup.

## Decision 6: Small browser interface and limited dependencies

**Decision:** serve a repository-owned HTML/CSS/JavaScript interface and use Node's standard HTTP/SQLite/test facilities. Use a maintained XML parser for the XML adapter.

**Reason:** reviewers can follow the complete implementation without a frontend build pipeline or remote assets. Fewer moving parts keep the container and local fallback straightforward.

**Tradeoff:** larger applications may benefit from a component framework, typed API clients and more mature routing. The interface still needs keyboard, responsive and browser QA.

## Illustrative delivery plan

The following is a planning example, not a record of previous team employment. Estimates are deliberately relative and should be revised after discovery.

| Priority | Backlog item | Acceptance | Relative size |
| --- | --- | --- | --- |
| P0 | Product model and quality gate | Incomplete Draft saves; invalid Submit fails with field issues | M |
| P0 | Governed review and audit | Independent approval; rejected changes leave consistent state | M |
| P0 | Supplier onboarding | Three sample formats; dry run; atomic duplicate rejection | M |
| P0 | ERP delivery | Durable enqueue; receiver outage recovery; deduplicated replay | L |
| P1 | Operations and recovery | Readiness, job triage and independent backup rehearsal | M |
| P1 | Recruiter demo documentation | Fresh clone runs; guided scenario matches UI | S |
| Future | SSO and account lifecycle | Organizational login, revocation and assigned roles | L |
| Future | Distributed job leasing | Parallel workers claim jobs safely; crash recovery tested | L |
| Future | Stewardship aging/ownership | Assigned owner, SLA visibility and reminders | M |
| Future | Real STEP/SAP adapter | Approved vendor schema, licensed test system and qualified contract | Discovery |

An illustrative first sprint delivers model, Draft validation, revision checks and review with tests. Its review follows one record from creation to approval. A second sprint adds file onboarding, publication and receiver failure recovery, then reviews the full end-to-end flow. A third hardening slice focuses on restoration, security boundaries and a fresh-clone demo.

A stand-up update should name a concrete completed behavior, the next acceptance criterion and any dependency requiring review. In a retrospective, inspect the most time-consuming failure boundary, reduce one repeatable source of friction and add a specific follow-up item. Do not treat a long feature list as proof of an effective agile process.
