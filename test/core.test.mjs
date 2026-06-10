import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  classify,
  routeFromBackendApi as auditApiRoute,
  routeFromFrontendPage as auditPageRoute,
} from '../src/audit.mjs';
import { buildScenario, inferFlow, routeFromFrontendPage as generatedPageRoute } from '../src/generate-scenarios.mjs';
import { normalizeUrl, scenarioFor, scenarioIdFor } from '../src/crawl.mjs';
import { getBrowserLaunchArgs } from '../src/run-ai-qa.mjs';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('src/cli.mjs');

async function tmpProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'probeqa-test-'));
  await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
  return dir;
}

async function writeFile(root, file, content = '') {
  const fullPath = path.join(root, file);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf8');
}

async function runCli(cwd, args) {
  return execFileAsync(process.execPath, [cliPath, ...args], { cwd, maxBuffer: 1024 * 1024 });
}

test('frontend and backend route detection ignores framework and support files', () => {
  assert.equal(auditPageRoute('pages/index.tsx'), '/');
  assert.equal(auditPageRoute('pages/classes/[id]/modules/index.tsx'), '/classes/:id/modules');
  assert.equal(auditPageRoute('pages/_app.tsx'), null);
  assert.equal(auditPageRoute('pages/join/styles.ts'), null);
  assert.equal(auditPageRoute('pages/api/auth/[...nextauth].ts'), null);
  assert.equal(auditApiRoute('src/app/api/classes/[id]/route.ts'), '/api/classes/:id');
  assert.equal(auditApiRoute('src/app/services/classes.ts'), null);
});

test('route classification groups high-risk app areas', () => {
  assert.equal(classify('/dashboard/users'), 'admin/org');
  assert.equal(classify('/settings/subscription'), 'billing');
  assert.equal(classify('/classes/:id/modules'), 'core learning');
  assert.equal(classify('/signup'), 'auth/onboarding');
  assert.equal(classify('/privacy'), 'general');
});

test('generator infers changed surfaces and builds reviewable scenario drafts', () => {
  const changes = [
    { projectName: 'App', projectKind: 'frontend', file: 'pages/signup/index.tsx' },
    { projectName: 'App', projectKind: 'frontend', file: 'src/components/Signup/Form.tsx' },
    { projectName: 'API', projectKind: 'backend', file: 'src/app/api/auth/signup/route.ts' },
  ];
  const flow = inferFlow(changes);
  const scenario = buildScenario(changes, flow);

  assert.deepEqual(flow.frontendRoutes, ['/signup']);
  assert.deepEqual(flow.backendRoutes, ['/api/auth/signup']);
  assert.match(scenario.fileName, /^generated-\d{4}-\d{2}-\d{2}-/);
  assert.match(scenario.content, /baseUrl}\$\{?\/signup|baseUrl}\/signup/);
  assert.match(scenario.content, /backendUrl.*\/api\/auth\/signup/);
  assert.equal(generatedPageRoute('pages/_document.tsx'), null);
});

test('crawler helper normalizes URLs and writes deterministic scenario files', () => {
  assert.equal(normalizeUrl('http://localhost:3000/signup/#top'), 'http://localhost:3000/signup');
  assert.equal(normalizeUrl('http://localhost:3000/signup/'), 'http://localhost:3000/signup');
  assert.equal(scenarioIdFor('http://localhost:3000/classes/abc/modules'), 'crawl-classes-abc-modules');

  const scenario = scenarioFor({ url: 'http://localhost:3000/privacy' }, 'http://localhost:3000');
  assert.equal(scenario.fileName, 'crawl-privacy.mjs');
  assert.match(scenario.content, /Crawled public route \/privacy/);
  assert.match(scenario.content, /page.goto\(`\$\{baseUrl}\/privacy`/);
});

test('browser launch args disable Chromium sandbox in CI', () => {
  assert.deepEqual(getBrowserLaunchArgs({ CI: 'true' }), [
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ]);
  assert.deepEqual(
    getBrowserLaunchArgs({
      CI: 'true',
      PROBEQA_CHROME_ARGS: '--disable-dev-shm-usage --no-sandbox',
    }),
    ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox']
  );
  assert.deepEqual(
    getBrowserLaunchArgs({ CI: 'true', PROBEQA_NO_SANDBOX: 'false' }),
    []
  );
});

test('CLI init, list, and audit work in a consuming app repo', async () => {
  const cwd = await tmpProject();
  await runCli(cwd, ['init']);
  await writeFile(cwd, 'pages/index.tsx');
  await writeFile(cwd, 'pages/_app.tsx');
  await writeFile(cwd, 'pages/join/styles.ts');
  await writeFile(cwd, 'src/app/api/health/route.ts');
  await writeFile(cwd, 'probeqa/scenarios/public.mjs', `export default {
  id: 'public',
  title: 'Public route coverage',
  async run() {}
};
// Coverage anchors: / /api/health
`);

  const listed = await runCli(cwd, ['list']);
  assert.match(listed.stdout, /public - Public route coverage/);

  const audit = await runCli(cwd, ['audit', '--repo', 'App']);
  assert.match(audit.stdout, /Scenarios found: 1/);
  assert.match(audit.stdout, /Routes found: 2/);
  assert.match(audit.stdout, /Uncovered routes: 0/);
  assert.doesNotMatch(audit.stdout, /_app|join\/styles/);
});

test('CLI plan reads git diffs and reports the changed route without writing', async () => {
  const cwd = await tmpProject();
  await writeFile(cwd, 'probeqa.config.json', JSON.stringify({
    projects: [{ name: 'App', path: '.', kind: 'frontend', baseUrl: 'http://localhost:3000' }],
    scenariosDir: 'probeqa/scenarios',
    artifactsDir: 'probeqa/artifacts',
  }, null, 2));
  await writeFile(cwd, 'pages/signup/index.tsx', 'export default function Signup() { return null; }\n');
  await fs.mkdir(path.join(cwd, 'probeqa/scenarios'), { recursive: true });
  await execFileAsync('git', ['init'], { cwd });
  await execFileAsync('git', ['add', '.'], { cwd });
  await execFileAsync('git', ['-c', 'user.name=ProbeQA', '-c', 'user.email=probeqa@example.com', 'commit', '-m', 'initial'], { cwd });
  await writeFile(cwd, 'pages/signup/index.tsx', 'export default function Signup() { return "changed"; }\n');

  const plan = await runCli(cwd, ['plan', '--repo', 'App']);
  assert.match(plan.stdout, /Scenario:/);
  assert.match(plan.stdout, /pages \/signup/);

  const scenarioFiles = await fs.readdir(path.join(cwd, 'probeqa/scenarios'));
  assert.deepEqual(scenarioFiles, []);
});
