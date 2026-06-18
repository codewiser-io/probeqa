import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { refineScenarioDraft } from './ai-adapters.mjs';
import { loadConfig } from './config.mjs';

const execFileAsync = promisify(execFile);

async function git(repoPath, args) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], { maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    if (error.code === 128) return '';
    return '';
  }
}

async function collectChangedFiles(project, projectRoot, values) {
  const repoPath = path.resolve(projectRoot, project.path);
  const stat = await fs.stat(repoPath).catch(() => null);
  if (!stat?.isDirectory()) return [];

  const sources = await Promise.all([
    git(repoPath, ['diff', '--name-only', values.base]),
    git(repoPath, ['diff', '--cached', '--name-only']),
    git(repoPath, ['diff', '--name-only', 'origin/main...HEAD']),
  ]);

  return [...new Set(sources.flatMap((source) => source.split('\n')).filter(Boolean))]
    .sort()
    .map((file) => ({ projectName: project.name, projectKind: project.kind, repoPath, file }));
}

export function routeFromFrontendPage(file) {
  if (!file.startsWith('pages/') || !/\.(tsx|ts|jsx|js)$/.test(file)) return null;
  if (file.includes('/api/')) return null;
  const basename = path.basename(file).replace(/\.(tsx|ts|jsx|js)$/, '');
  if (basename.startsWith('_') || ['styles', 'style', 'constants', 'types'].includes(basename)) return null;
  if (file.split('/').some((segment) => ['styles', '__tests__', '__mocks__'].includes(segment))) return null;
  let route = file
    .replace(/^pages/, '')
    .replace(/\.(tsx|ts|jsx|js)$/, '')
    .replace(/\/index$/, '')
    .replace(/\[(.+?)\]/g, ':$1');
  return route || '/';
}

export function routeFromBackendApi(file) {
  if (!file.startsWith('src/app/api/') || !file.endsWith('/route.ts')) return null;
  return `/${file}`
    .replace(/^\/src\/app/, '')
    .replace(/\/route\.ts$/, '')
    .replace(/\[(.+?)\]/g, ':$1');
}

export function inferFlow(changes) {
  const frontendRoutes = changes.map((change) => routeFromFrontendPage(change.file)).filter(Boolean);
  const backendRoutes = changes.map((change) => routeFromBackendApi(change.file)).filter(Boolean);
  const frontendActions = changes.filter((change) => change.file.startsWith('src/utils/actions/'));
  const components = changes.filter((change) => change.file.includes('src/components/'));

  const titleParts = [];
  if (frontendRoutes.length) titleParts.push(`pages ${frontendRoutes.slice(0, 3).join(', ')}`);
  if (backendRoutes.length) titleParts.push(`APIs ${backendRoutes.slice(0, 3).join(', ')}`);
  if (components.length) titleParts.push(`${components.length} component file(s)`);
  if (frontendActions.length) titleParts.push(`${frontendActions.length} action file(s)`);

  return {
    frontendRoutes: [...new Set(frontendRoutes)],
    backendRoutes: [...new Set(backendRoutes)],
    hasFrontend: changes.some((change) => change.projectKind === 'frontend' || change.file.startsWith('pages/')),
    hasBackend: changes.some((change) => change.projectKind === 'backend' || change.file.startsWith('src/app/api/')),
    title: titleParts.join(' + ') || 'changed app flow',
  };
}

export function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 72) || 'generated-flow';
}

export function buildScenario(changes, flow) {
  const date = new Date().toISOString().slice(0, 10);
  const primaryRoute = flow.frontendRoutes[0] ?? '/';
  const primaryApi = flow.backendRoutes[0] ?? '/api/health';
  const id = `generated-${date}-${slugify(flow.title)}`;
  const tags = ['generated'];
  if (flow.hasFrontend) tags.push('frontend');
  if (flow.hasBackend) tags.push('backend');

  return {
    id,
    fileName: `${id}.mjs`,
    content: `export default {
  id: '${id}',
  title: 'Generated QA for ${flow.title.replace(/'/g, "\\'")}',
  tags: ${JSON.stringify(tags)},
  risk: 'Generated from changed files. Tighten this scenario around the PR-specific happy path, forbidden path, and empty/error states before push.',
  async run({ page, baseUrl, backendUrl, expect, step, clickByText }) {
    await step('Open the primary changed surface', async () => {
      await page.goto(\`\${baseUrl}${primaryRoute}\`, { waitUntil: 'networkidle2' });
      await expect.visibleText(/./);
    });

    await step('Exercise a visible action or navigation path', async () => {
      const clicked = await clickByText(/continue|save|start|create|join|submit|next|view|open|sign/i);
      if (!clicked) console.warn('No obvious CTA found. Replace this with the PR-specific click path.');
    });

    await step('Probe backend-visible behavior', async () => {
      const response = await page.evaluate(async (url) => {
        try {
          const result = await fetch(url, { credentials: 'include' });
          return { status: result.status, ok: result.ok };
        } catch {
          return null;
        }
      }, \`\${backendUrl}${primaryApi}\`);
      await expect.responseStatusIn(response, [200, 204, 401, 403, 404], 'Unexpected API status');
    });
  },
};
`,
  };
}

export function buildPlan(changes, flow, scenario) {
  const changedFiles = changes.map((change) => `- ${change.projectName}/${change.file}`).join('\n');
  return `AI QA generation plan

Scenario: ${scenario.fileName}
Surface: ${flow.title}

Edge cases to sharpen before push:
- Happy path with realistic seeded data
- Empty state or first-use state
- Forbidden/auth boundary for the changed route/API
- Invalid form/input state if any form changed
- Slow or failed backend response when frontend actions changed

Changed files:
${changedFiles || '- No changed files detected'}
`;
}

export async function main(argv = process.argv.slice(2), projectRoot = process.cwd()) {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: 'string', default: process.env.AI_QA_DIFF_BASE ?? 'HEAD' },
      plan: { type: 'boolean', default: false },
      write: { type: 'boolean', default: true },
      repo: { type: 'string', multiple: true },
      refine: { type: 'boolean', default: false },
      provider: { type: 'string' },
      model: { type: 'string' },
    },
  });
  const config = await loadConfig(projectRoot);
  const projects = config.projects;
  if (projects.length === 0) {
    throw new Error('No projects configured. Run "probeqa init" or add projects to probeqa.config.json.');
  }
  const selectedProjects = values.repo?.length
    ? projects.filter((project) =>
        values.repo.some((repo) => project.name.toLowerCase() === repo.toLowerCase() || project.path.includes(repo))
      )
    : projects;
  if (selectedProjects.length === 0) {
    throw new Error(`No configured project matched: ${values.repo.join(', ')}`);
  }
  const changes = (await Promise.all(selectedProjects.map((project) => collectChangedFiles(project, projectRoot, values)))).flat();
  const flow = inferFlow(changes);
  let scenario = buildScenario(changes, flow);
  const plan = buildPlan(changes, flow, scenario);

  console.log(plan);

  if (values.plan || values.write === false) return;

  const refinement = await refineScenarioDraft({
    scenario,
    plan,
    aiRefinement: config.aiRefinement,
    overrides: {
      enabled: values.refine || config.aiRefinement.enabled,
      provider: values.provider,
      model: values.model,
    },
  });
  if (refinement.changed) {
    scenario = refinement.scenario;
    console.log(`Refined scenario with ${refinement.provider}`);
  } else if (values.refine || config.aiRefinement.enabled) {
    console.warn(`AI refinement skipped: ${refinement.reason}`);
  }

  const scenariosDir = path.resolve(projectRoot, config.scenariosDir);
  await fs.mkdir(scenariosDir, { recursive: true });
  const scenarioPath = path.join(scenariosDir, scenario.fileName);
  const exists = await fs.stat(scenarioPath).then(() => true).catch(() => false);
  if (exists) throw new Error(`Refusing to overwrite existing scenario: ${scenarioPath}`);

  await fs.writeFile(scenarioPath, scenario.content, 'utf8');
  console.log(`Wrote ${path.relative(projectRoot, scenarioPath)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
