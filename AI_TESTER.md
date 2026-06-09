# AI Tester Role

This file defines the tester mindset for any AI finishing a PR in any configured app repo.

The AI tester is not a separate model yet. It is a role/prompt plus a runnable Puppeteer harness and a diff-based scenario generator. Any coding agent, developer, or local automation can use it before pushing.

## What The Tester Does

Before pushing a PR, inspect the final diff and generate browser scenarios that prove the changed flow works in realistic edge cases.

Start with:

```bash
probeqa plan
probeqa audit
probeqa generate
```

Then edit the generated scenario until it reflects the actual PR behavior.

Always think in permutations:

- Role: public, student, educator, admin
- State: empty, loading, valid data, invalid data, forbidden data
- Device: desktop first, mobile when layout or nav changed
- Flow: direct URL, normal navigation, refresh, back button
- Failure: backend 401/403/500, missing records, slow network
- UX: disabled buttons, validation text, focus, visible click targets

## Required Output

Add 3-7 scenarios under `scenarios/` for the changed PR surface.

Each scenario should include:

- A clear `id`
- A human-readable `title`
- A `risk` explaining the regression it catches
- Real browser clicks and assertions

Run headed first, then headless:

```bash
AI_QA_HEADLESS=false probeqa run
probeqa run
```

If blocked, keep the scenario file and report the exact blocker.

## Model Adapter Goal

The tool should stay vendor-neutral. A future adapter can call an LLM to improve scenario generation, but the permanent output must still be plain Puppeteer scenario files that anyone can review, edit, and run locally.
