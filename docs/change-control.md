# Change control and defect analysis

This is a reproducible workflow for the portfolio repository. The sample change and incident below are **illustrative training scenarios**, not claims about an employer, a real incident or a completed production release.

## From requirement to release

1. Open an issue with the problem, intended behavior, acceptance criteria and affected record/workflow/integration scope.
2. Agree the implementation boundary. Escalate changes to identity policy, supplier schemas, approval authority or downstream mapping for review.
3. Create a branch and keep changes scoped. Add regression coverage where behavior or a failure boundary changes.
4. Open a pull request using the repository template. Explain the trigger, resulting behavior, relevant checks and rollback implications.
5. Review CI output for the proposed commit. Inspect rule changes, migrations, authorization and transaction boundaries.
6. Capture a pre-release backup and known-good commit/image. Rehearse the changed workflow locally.
7. Deploy with `docker compose up --build -d`, check readiness and perform the relevant demo scenario.
8. Record actual results, residual risk and follow-up work. If validation fails, stop delivery, roll back and reconcile receiver acknowledgements.

## Release checklist

- [ ] Requirements and acceptance criteria describe the final behavior.
- [ ] Relevant unit, API, integration and regression checks pass at the release commit.
- [ ] `npm run check` and dependency checks pass, or an exception is explicitly reviewed.
- [ ] Docker build/configuration is checked in the target environment.
- [ ] The affected browser workflow is exercised.
- [ ] Mapping/schema compatibility and data migration are reviewed where applicable.
- [ ] A recoverable backup and known-good revision are recorded.
- [ ] `npm run verify:backup` succeeds if storage/recovery behavior changed.
- [ ] Runbook/API/requirements documentation reflects the release.
- [ ] Post-deploy readiness, job backlog and errors are inspected.

The CI workflow defines the checks actually executed. A checked box should refer to an observed result, not to a planned test. Keep failed results and explanations in the pull request; do not rewrite history to imply an uninterrupted green run.

## Illustrative defect analysis

**Scenario:** a supplier imports a circuit breaker without an applicable voltage value. The record can be saved as Draft, but a defective quality implementation checks only generic text attributes and permits submission. The reviewer later discovers an incomplete downstream material.

| Analysis step | Concrete example |
| --- | --- |
| Impact | An incomplete product reaches review; publication could expose unusable electrical attributes |
| Detection | Compare category-specific input against the documented submit gate |
| Reproduction | Create a Draft with required identity/reference data, category `CIRCUIT_BREAKERS` and `voltage: null`; attempt Submit |
| Root cause | Submission trusts a generic completeness check and omits the category-specific rule |
| Correction | Centralize category evaluation in `evaluateQuality`; all callers use the same gate |
| Regression | Assert missing/invalid applicable voltage blocks Submit and leaves record/version/audit state unchanged |
| Positive check | Add valid applicable voltage and assert the same record can enter InReview |
| Compatibility | Incomplete Draft onboarding stays allowed; categories without that requirement stay valid |
| Follow-up | Review category rules and test an API call that bypasses the browser |

The regression should verify the rejected transition and its side effects, not only compare a helper's output to its own implementation. The repository's real test suite is the evidence for whether the final code enforces that behavior.

## Illustrative change record

| Field | Example |
| --- | --- |
| Change | Enforce category-specific quality before submission |
| Acceptance | Invalid circuit breaker remains Draft; corrected circuit breaker submits; file preview shows matching issues |
| Risk | Stricter rules can block previously accepted records |
| Review | Data owner confirms voltage requirement; developer reviews transaction behavior |
| Validation | Domain gate, HTTP transition, import preview and unaffected-category scenarios |
| Rollback | Revert rule release; retain evidence; re-evaluate affected data before publication |

For a real change, replace these examples with approved requirements, named reviewers and actual test/recovery results. Do not manufacture approval records or operational metrics for a portfolio.
