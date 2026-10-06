# Validation record

Observed locally on October 6, 2026. Results apply to this portfolio implementation and do not establish production reliability.

| Check | Observed result |
| --- | --- |
| Node domain, API, integration and security suite | 34 tests passed |
| Browser workflow checks in headless Microsoft Edge | 4 tests passed |
| Desktop browser workflow | Draft creation, role handoff, independent approval, publication, ERP material and audit verified |
| Import browser workflow | Preview writes nothing, import commits, repeated identity is rejected |
| Conflict handling | Invalid submission explains quality issues; stale save offers refresh |
| Mobile at 390 × 844 | Overview and integrations fit the viewport; navigation and administrator controls work |
| Docker Compose | Images built; both services healthy; persistent application and receiver volumes |
| Live HTTP walkthrough | Product created, submitted, approved, published, delivered and audited |
| Recovery | SQLite snapshot rehearsal passed; documented Docker backup, stopped-app restore and restart exercised |
| Dependency check | Install audit reported no known vulnerabilities at validation time |
| Documentation | Relative Markdown links resolve; banner SVG parses; API specification is valid JSON |

Local Node 24.11.0 was used for the Windows checks. Docker ran Node 24.21.0; the Dockerfile pins the official image by digest. Browser tests use fresh in-memory services and do not change the developer's normal database. Docker walkthroughs create labeled fictional demo records in the demo volume.

The GitHub [quality-gates workflow](https://github.com/Clayton-Klemm/atlas-mdm/actions/workflows/ci.yml) performs the JavaScript checks and Chromium browser tests, builds and starts Compose, executes the HTTP walkthrough, and rehearses backup restoration. Review its result for the exact commit. Browser failures retain traces as workflow artifacts.

Reproduce with `npm run check`, `npm test`, `npx playwright install chromium`, and `npm run test:ui`. With Compose running, use `npm run demo` and `docker compose exec -T app npm run verify:backup`. See the [runbook](runbook.md) for the actual stopped-app restoration procedure.
