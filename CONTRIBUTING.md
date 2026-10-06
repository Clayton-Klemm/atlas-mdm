# Contributing

Start with a small issue that describes the problem, the proposed result and acceptance criteria. Changes to data identity, category rules, approval authority or external mapping need an explicit rationale because their effects extend beyond one screen.

## Local setup

Use Node.js 24 and install the exact dependency lockfile:

```sh
npm ci
npm run dev
```

Run the relevant checks before opening a pull request:

```sh
npm test
npm run check
```

Run `npm run verify:backup` for storage/recovery changes. Exercise the affected browser workflow and Docker environment for deployment/UI changes. Record actual results and any environment limitation.

## Implementation expectations

- Keep business decisions in the domain service and enforce authorization on the server.
- Preserve required-version checks, transactions, independent approval and publication snapshots.
- Bind user values in SQL, render user content as text and reject unknown editable fields.
- Use fictional fixtures and never commit databases, cookies, private records or access tokens.
- Test observable behavior and failure consequences; include regression coverage for a defect.
- Update the API specification, acceptance criteria or runbook when a contract changes.

Use a focused branch and a descriptive commit message. The pull-request template asks for the problem, behavior, validation and operational impact. See [change control](docs/change-control.md) for releases and the [security policy](SECURITY.md) for sensitive reports.
