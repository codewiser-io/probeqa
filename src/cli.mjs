#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , command = 'run', ...args] = process.argv;
const commands = new Set(['run', 'list', 'generate', 'plan', 'audit', 'crawl', 'init']);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(__dirname, '..', 'package.json');

if (command === '--help' || command === '-h' || command === 'help') {
  printHelp();
} else if (command === '--version' || command === '-v' || command === 'version') {
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  console.log(pkg.version);
} else if (!commands.has(command)) {
  console.error(`Unknown command "${command}". Use: probeqa init|run|list|generate|plan|audit|crawl`);
  process.exitCode = 1;
} else if (command === 'init') {
  await initProject();
} else {
  const commandArgs = [...args];
  if (command === 'list') commandArgs.push('--list');
  if (command === 'plan') commandArgs.push('--plan');
  if (command === 'audit') {
    const mod = await import('./audit.mjs');
    await mod.main(commandArgs);
  } else if (command === 'crawl') {
    const mod = await import('./crawl.mjs');
    await mod.main(commandArgs);
  } else {
    const mod = await import(command === 'generate' || command === 'plan' ? './generate-scenarios.mjs' : './run-ai-qa.mjs');
    await mod.main(commandArgs);
  }
}

async function initProject() {
  const root = process.cwd();
  const scenarioDir = path.join(root, 'probeqa', 'scenarios');
  const artifactDir = path.join(root, 'probeqa', 'artifacts');
  const configPath = path.join(root, 'probeqa.config.json');
  const templatePath = path.join(scenarioDir, '_template.mjs');

  await fs.mkdir(scenarioDir, { recursive: true });
  await fs.mkdir(artifactDir, { recursive: true });

  await writeIfMissing(configPath, `${JSON.stringify({
    projects: [
      {
        name: 'App',
        path: '.',
        kind: 'app',
        baseUrl: 'http://localhost:3000',
      },
    ],
    scenariosDir: 'probeqa/scenarios',
    artifactsDir: 'probeqa/artifacts',
  }, null, 2)}
`);

  await writeIfMissing(templatePath, `export default {
  id: 'example-flow',
  title: 'Example browser flow',
  tags: ['example'],
  risk: 'Replace this with the regression this scenario catches.',
  async run({ page, baseUrl, expect, step }) {
    await step('Open app', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle2' });
      await expect.visibleText(/./);
    });
  },
};
`);

  console.log('Initialized ProbeQA');
  console.log(`- ${path.relative(root, configPath)}`);
  console.log(`- ${path.relative(root, scenarioDir)}`);
}

function printHelp() {
  console.log(`ProbeQA

Usage:
  probeqa init
  probeqa plan [--repo <name>]
  probeqa audit [--repo <name>]
  probeqa crawl [--baseUrl <url>] [--maxPages <n>] [--generate]
  probeqa generate [--repo <name>]
  probeqa run [--scenario <id>] [--baseUrl <url>] [--runner puppeteer|playwright]
  probeqa list

Environment:
  AI_QA_HEADLESS=false   Run with a visible browser
  AI_QA_BASE_URL=<url>   Override frontend base URL
  AI_QA_BACKEND_URL=<url> Override backend base URL
  PROBEQA_RUNNER=<name>  puppeteer or playwright
`);
}

async function writeIfMissing(filePath, content) {
  const exists = await fs.stat(filePath).then(() => true).catch(() => false);
  if (!exists) await fs.writeFile(filePath, content, 'utf8');
}
