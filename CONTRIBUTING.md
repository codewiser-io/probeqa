# Contributing

ProbeQA is meant to become a public, self-extending AI QA tool.

## Good Contributions

- Better scenario generation from diffs
- App-map discovery for routes, forms, roles, and API calls
- Reusable Puppeteer helpers
- Deterministic seed-data setup
- Browser artifacts: screenshots, traces, console/network reports
- Model-provider adapters that can generate scenarios without locking the project to one AI vendor

## Scenario Quality Bar

Generated tests should be reviewed before they become permanent integration tests.

Keep tests:

- Deterministic
- Browser-real
- Focused on user-visible risk
- Safe for local/dev data
- Clear about the regression they catch

Do not commit production credentials, personal test accounts, or destructive flows against shared environments.
