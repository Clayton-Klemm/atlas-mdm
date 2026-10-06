# Requirements and evidence

Atlas was designed for the [Border States MDM IT Application Developer role](https://careers.borderstates.com/job/Fargo-MDM-IT-Application-Developer-ND-58104/1432773600/), requisition 32574, reviewed October 6, 2026. The table groups role expectations rather than reproducing the posting. A portfolio can provide inspectable evidence of implementation; it cannot prove every hiring qualification.

## Role alignment

| Expectation | Repository evidence | Limit |
| --- | --- | --- |
| MDM models, rules, workflows and UI | Product/supplier/category model, quality gate, independent review, browser interface | Independent implementation |
| JavaScript, XML, JSON, REST and regex | Domain code, three import adapters, API, SKU validation | Review implementation and tests |
| Source control and lifecycle | GitHub CI, PR/issue templates, release/rollback guidance | Commit history shows this project only |
| Testing and defect analysis | Automated scenarios and [illustrative RCA](change-control.md#illustrative-defect-analysis) | CI results are commit-specific |
| Security and governance | Server roles, session controls, revision checks, audit | Local demo security scope |
| Operations and continuity | Durable jobs, health endpoints, triage and backup rehearsal | No production uptime claim |
| Agile delivery and collaboration | [Illustrative backlog/sprint](decisions.md#illustrative-delivery-plan), acceptance criteria and review templates | Not evidence of team employment |
| STEP familiarity | [Official-documentation-informed concepts](architecture.md#relationship-to-step) | No licensed STEP or hands-on platform claim |
| SAP integration | Documented SAP-inspired REST field mapping and mock receiver | No live SAP or certified connector |
| STEM degree/equivalent; two years of agile experience | Candidate's résumé and verifiable work history | A project cannot establish either |
| English communication | English documentation and clear error messages | Speaking ability must be assessed separately |
| Communication, judgment and independence | Architecture rationale, runbook and scoped decisions | Interview and references remain necessary |

## Acceptance criteria

| ID | Reviewable behavior | How to inspect |
| --- | --- | --- |
| MDM-01 | A product has controlled supplier/category references and revision metadata | Create and inspect a product |
| MDM-02 | Incomplete Drafts remain editable; submission shows specific quality failures | Attempt to submit an incomplete Draft |
| MDM-03 | Creator/last editor cannot approve their own record | Use admin to create and attempt approval |
| MDM-04 | Review rejection requires a reason; reopening clears previous approval | Workflow UI and audit history |
| MDM-05 | Outdated versions fail with a conflict instead of losing edits | Two sessions editing the same Draft; API tests |
| INT-01 | JSON, CSV and XML samples map to the same canonical attributes | Preview each sample before import |
| INT-02 | A malformed/duplicate batch commits no partial records | Import validation tests |
| INT-03 | Publication creates a durable payload snapshot and delivery job atomically | Inspect job and audit after publish |
| INT-04 | Temporary receiver failures retry; exhausted jobs can be recovered by admin | Integration demo and worker tests |
| INT-05 | Repeated delivery with the same key does not duplicate receiver data | Receiver integration tests |
| SEC-01 | Unauthorized actions fail on the server even when directly requested | API access-control tests |
| SEC-02 | Mutation requests require the app request header and allowed origin | API security tests |
| OPS-01 | Readiness checks database access; logs correlate API errors by request ID | Operational endpoints and container logs |
| OPS-02 | Backup restoration is exercised against a separate SQLite file | `npm run verify:backup` |
| DOC-01 | A new reviewer can start, demonstrate, diagnose and stop the application | README and walkthrough |

## Evidence standards

Read source and automated checks alongside the interface. A green workflow is evidence for its exact revision, not a general reliability guarantee. Seed events are labeled as demo data. Sprint plans, change examples and defect scenarios in this repository are educational artifacts rather than invented employer history.

All products, suppliers, brands, users and downstream records are fictional. No employer data, proprietary configuration, vendor binaries or credentials are included. A real STEP/SAP assignment would require access to the licensed platform, agreed schemas, connectivity and enterprise review before making production changes.
