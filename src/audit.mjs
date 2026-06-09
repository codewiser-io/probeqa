import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'probeqa.config.json');

const { values } = parseArgs({
  options: {
    repo: { type: 'string', multiple: true },
  },
});

async function loadConfig() {
  const raw = await fs.readFile(configPath, 'utf8').catch(() => null);
  if (!raw) throw new Error('No probeqa.config.json found. Run "probeqa init" first.');
  try {
    const config = JSON.parse(raw);
    return {
      projects: Array.isArray(config.projects) ? config.projects : [],
      scenariosDir: config.scenariosDir ?? 'probeqa/scenarios',
    };
  } catch (error) {
    throw new Error(`Invalid probeqa.config.json: ${error.message}`);
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function routeFromFrontendPage(file) {
  if (!file.startsWith('pages/') || !/\.(tsx|ts|jsx|js)$/.test(file)) return null;
  if (file.includes('/api/')) return null;
  const basename = path.basename(file).replace(/\.(tsx|ts|jsx|js)$/, '');
  if (basename.startsWith('_') || ['styles', 'style', 'constants', 'types'].includes(basename)) return null;
  if (file.split('/').some((segment) => ['styles', '__tests__', '__mocks__'].includes(segment))) return null;
  const route = file
    .replace(/^pages/, '')
    .replace(/\.(tsx|ts|jsx|js)$/, '')
    .replace(/\/index$/, '')
    .replace(/\[(.+?)\]/g, ':$1');
  return route || '/';
}

function routeFromBackendApi(file) {
  if (!file.startsWith('src/app/api/') || !file.endsWith('/route.ts')) return null;
  return `/${file}`
    .replace(/^\/src\/app/, '')
    .replace(/\/route\.ts$/, '')
    .replace(/\[(.+?)\]/g, ':$1');
}

function classify(route) {
  if (/signup|login|auth|onboarding/i.test(route)) return 'auth/onboarding';
  if (/billing|payment|subscription|plan/i.test(route)) return 'billing';
  if (/admin|dashboard|organization|team/i.test(route)) return 'admin/org';
  if (/class|course|module|quiz|study|challenge/i.test(route)) return 'core learning';
  return 'general';
}

async function loadScenarioText(scenariosDir) {
  const files = await walk(scenariosDir);
  const scenarioFiles = files.filter((file) => file.endsWith('.mjs') && !path.basename(file).startsWith('_'));
  const contents = await Promise.all(scenarioFiles.map(async (file) => fs.readFile(file, 'utf8')));
  return {
    count: scenarioFiles.length,
    text: contents.join('\n'),
  };
}

async function main() {
  const config = await loadConfig();
  const selectedProjects = values.repo?.length
    ? config.projects.filter((project) =>
        values.repo.some((repo) => project.name.toLowerCase() === repo.toLowerCase() || project.path.includes(repo))
      )
    : config.projects;

  if (selectedProjects.length === 0) throw new Error('No configured projects matched the audit request.');

  const scenariosDir = path.resolve(projectRoot, config.scenariosDir);
  const scenarioData = await loadScenarioText(scenariosDir);
  const rows = [];

  for (const project of selectedProjects) {
    const repoPath = path.resolve(projectRoot, project.path);
    const files = await walk(repoPath);
    for (const absoluteFile of files) {
      const relativeFile = path.relative(repoPath, absoluteFile);
      const route = routeFromFrontendPage(relativeFile) ?? routeFromBackendApi(relativeFile);
      if (!route) continue;
      const covered = scenarioData.text.includes(route);
      rows.push({ project: project.name, route, kind: route.startsWith('/api/') ? 'api' : 'page', area: classify(route), covered });
    }
  }

  const uncovered = rows.filter((row) => !row.covered);
  console.log(`# ProbeQA Coverage Audit

Scenarios found: ${scenarioData.count}
Routes found: ${rows.length}
Uncovered routes: ${uncovered.length}
`);

  for (const area of [...new Set(uncovered.map((row) => row.area))].sort()) {
    console.log(`## ${area}`);
    for (const row of uncovered.filter((item) => item.area === area).slice(0, 25)) {
      console.log(`- [${row.kind}] ${row.project}: ${row.route}`);
    }
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
