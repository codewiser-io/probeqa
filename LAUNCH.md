# ProbeQA Launch Kit

ProbeQA is a local-first QA harness for AI coding agents. It crawls reachable app routes, generates Puppeteer scenario drafts, and runs real browser checks before a PR ships.

## Positioning

Tagline:

AI-generated browser QA for every PR.

Short description:

ProbeQA helps AI coding agents act like QA testers before code is pushed. It inspects changed files, crawls reachable routes, creates Puppeteer scenario drafts, and runs headless or headed browser checks that catch broken routes, console errors, missing assets, and dead user flows.

Why it is different:

- It is agent-ready, not just human-run E2E testing.
- It leaves generated tests in the repo instead of making QA a one-off chat response.
- It combines route audit, crawler discovery, scenario generation, and Puppeteer execution.
- It is local-first and open source, so teams can run expensive browser checks before CI.

## Best Star Channels

1. GitHub
   - Star/discovery starts here.
   - Keep topics, README, tests, CI, examples, and issues clean.

2. Hacker News
   - Use Show HN once the install path is public on npm.
   - HN cares about runnable tools and honest tradeoffs. Avoid hype.

3. DEV / Hashnode
   - Publish the technical story: "AI coding agents should write their own browser QA before PRs."
   - Include code snippets and failure screenshots.

4. Reddit
   - Use targeted, non-spammy posts in builder and dev communities.
   - Ask for feedback, do not pretend it is a finished enterprise platform.

5. AI/devtool communities
   - Cursor, Claude Code, Codex, Playwright/Puppeteer, QA, and testing communities.
   - The angle: "make agents prove browser behavior before pushing."

6. GitHub-native sharing
   - Share the release URL, discussion URL, and issue list.
   - Ask people to star/watch if they want agent-first browser QA to exist.

## GitHub Repo Metadata

Description:

AI-ready Puppeteer QA harness that crawls app routes, generates browser test drafts, and runs PR-end checks for coding agents.

Topics:

ai-qa, ai-agents, puppeteer, e2e-testing, browser-testing, test-generation, qa-automation, developer-tools, cli, open-source

## Demo Asset

Use the README demo GIF when sharing the launch:

`docs/assets/probeqa-demo.gif`

## Show HN Draft

Title:

Show HN: ProbeQA - AI-generated browser QA for every PR

URL:

https://github.com/codewiser-io/probeqa

Text:

I built ProbeQA because AI coding agents can write a lot of code quickly, but they usually do not leave behind durable browser QA.

ProbeQA is a local-first npm CLI that:

- crawls reachable app routes
- audits pages/API routes without scenarios
- generates Puppeteer scenario drafts from changed files
- runs headed/headless browser checks
- captures console errors, network failures, and screenshots

The intended workflow is: before pushing a PR, an AI agent runs ProbeQA, tightens the generated scenarios around the changed user flow, and commits those tests into the repo.

It is early and intentionally simple. It is not a hosted service or a trained model yet. The first useful version is a convention plus a runnable Puppeteer harness that any agent can use.

I would love feedback from people using AI agents for real app work: what would make this good enough to require before every PR?

## DEV / Hashnode Draft

Title:

AI coding agents should write browser QA before every PR

Tags:

ai, testing, puppeteer, opensource

Post:

AI coding agents are getting good at implementing features, but they are still weak at proving browser behavior before code is pushed.

I built ProbeQA as a local-first npm CLI for that gap.

The workflow is simple:

```bash
npm install -D probeqa
npx probeqa init
npx probeqa audit
npx probeqa crawl --generate
npx probeqa generate
AI_QA_HEADLESS=false npx probeqa run
npx probeqa run
```

ProbeQA gives an AI agent a repeatable tester loop:

- inspect changed files
- crawl reachable routes
- draft Puppeteer scenarios
- run real browser checks
- keep those scenarios in the repo

It catches the boring but expensive browser failures: broken routes, missing visible content, console errors, network failures, missing assets, and dead click paths.

This is not a hosted AI product. The open-source core is a CLI, a crawler, a route audit, a scenario generator, and a Puppeteer runner. The AI part is the agent using it as a required PR-end habit.

Repo:

https://github.com/codewiser-io/probeqa

I am looking for feedback from people building with AI agents: what browser QA should an agent be forced to prove before it pushes code?

## X / LinkedIn Draft

I built ProbeQA: an open-source Puppeteer QA harness for AI coding agents.

The idea is simple: before an agent pushes a PR, it should crawl the app, generate browser test drafts, run real headed/headless checks, and commit the scenarios it created.

It catches broken routes, console errors, missing assets, dead CTAs, and changed flows that unit tests miss.

Repo: https://github.com/codewiser-io/probeqa

Looking for devs using AI agents on real apps. What would make this good enough to require before every PR?

## Reddit Draft

Title:

I built an open-source crawler + Puppeteer QA harness for AI coding agents

Body:

I have been using AI agents to work on real app repos, and the recurring problem is that they can implement changes but do not reliably leave behind browser-level QA.

I built ProbeQA to make that a local workflow:

- crawl reachable routes
- audit route coverage
- generate Puppeteer scenario drafts from changed files
- run headed/headless browser tests
- keep scenarios in the repo for future PRs

It is early, local-first, and open source. Not a hosted SaaS.

Repo: https://github.com/codewiser-io/probeqa

I would like blunt feedback: what would this need before you would trust it as a required PR-end check?

## GitHub Star Ask

Short:

If you want AI coding agents to prove browser behavior before pushing code, star the repo and tell me what workflow this should support next:

https://github.com/codewiser-io/probeqa

Long:

I am building ProbeQA as an open-source library, not a SaaS launch.

The goal is to make AI agents leave behind browser QA every time they touch an app: crawl routes, generate Puppeteer scenario drafts, run the browser, and commit the tests.

If that sounds useful, a GitHub star/watch genuinely helps with discovery:

https://github.com/codewiser-io/probeqa

Feedback thread:

https://github.com/codewiser-io/probeqa/discussions/5

## Submission Checklist

- [ ] Fix npm publish for latest version.
- [x] Add a short demo GIF or screen recording.
- [ ] Add GitHub social preview image.
- [ ] Add 3-5 GitHub issues labeled `good first issue`.
- [x] Enable GitHub Discussions.
- [x] Create GitHub release.
- [x] Create GitHub feedback discussion.
- [ ] Post Show HN.
- [ ] Publish DEV/Hashnode article.
- [ ] Post X/LinkedIn.
- [ ] Post targeted Reddit feedback thread.
