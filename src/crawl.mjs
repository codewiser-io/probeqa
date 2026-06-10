import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getBrowserLaunchArgs } from './browser.mjs';

async function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, 'probeqa.config.json');
  const raw = await fs.readFile(configPath, 'utf8').catch(() => null);
  if (!raw) throw new Error('No probeqa.config.json found. Run "probeqa init" first.');
  try {
    const config = JSON.parse(raw);
    return {
      projects: Array.isArray(config.projects) ? config.projects : [],
      scenariosDir: config.scenariosDir ?? 'probeqa/scenarios',
      artifactsDir: config.artifactsDir ?? 'probeqa/artifacts',
    };
  } catch (error) {
    throw new Error(`Invalid probeqa.config.json: ${error.message}`);
  }
}

export function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  return url.href.replace(/\/$/, '');
}

export function scenarioIdFor(url) {
  const parsed = new URL(url);
  const slug = parsed.pathname
    .replace(/^\/$/, 'home')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `crawl-${slug || 'home'}`;
}

export function scenarioFor(pageInfo, baseUrl) {
  const parsedBase = new URL(baseUrl);
  const relativePath = pageInfo.url.replace(parsedBase.origin, '') || '/';
  const id = scenarioIdFor(pageInfo.url);
  return {
    id,
    fileName: `${id}.mjs`,
    content: `export default {
  id: '${id}',
  title: 'Crawled public route ${relativePath}',
  tags: ['crawl', 'public'],
  risk: 'Catches broken rendering, console crashes, and missing visible content for ${relativePath}.',
  async run({ page, baseUrl, expect, step }) {
    await step('Open ${relativePath}', async () => {
      const response = await page.goto(\`\${baseUrl}${relativePath}\`, { waitUntil: 'networkidle2' });
      await expect.responseOk(response, 'Route did not return a successful response');
      await expect.visibleText(/./);
    });
  },
};
`,
  };
}

async function loadPuppeteer(projectRoot) {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  try {
    return (await import('puppeteer')).default;
  } catch {
    try {
      return projectRequire('puppeteer');
    } catch (error) {
      throw new Error(`Puppeteer is not installed. Run "npm install -D probeqa". Original error: ${error.message}`);
    }
  }
}

export async function main(argv = process.argv.slice(2), projectRoot = process.cwd()) {
  const { values } = parseArgs({
    args: argv,
    options: {
      baseUrl: { type: 'string', default: process.env.AI_QA_BASE_URL },
      maxPages: { type: 'string', default: '25' },
      depth: { type: 'string', default: '2' },
      generate: { type: 'boolean', default: false },
      headless: { type: 'string', default: process.env.AI_QA_HEADLESS ?? 'true' },
      out: { type: 'string' },
    },
  });
  const config = await loadConfig(projectRoot);
  const baseUrl = values.baseUrl ?? config.projects.find((project) => project.baseUrl)?.baseUrl;
  if (!baseUrl) throw new Error('No base URL found. Pass --baseUrl or set a project baseUrl in probeqa.config.json.');

  const puppeteer = await loadPuppeteer(projectRoot);

  const maxPages = Number.parseInt(values.maxPages, 10);
  const maxDepth = Number.parseInt(values.depth, 10);
  const artifactsDir = path.resolve(projectRoot, config.artifactsDir);
  const outPath = path.resolve(projectRoot, values.out ?? path.join(config.artifactsDir, 'crawl-map.json'));
  const root = normalizeUrl(baseUrl);
  const origin = new URL(root).origin;
  const queue = [{ url: root, depth: 0 }];
  const seen = new Set();
  const pages = [];

  await fs.mkdir(artifactsDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: values.headless !== 'false',
    args: getBrowserLaunchArgs(),
    defaultViewport: { width: 1440, height: 1000 },
  });
  const page = await browser.newPage();

  try {
    while (queue.length > 0 && pages.length < maxPages) {
      const current = queue.shift();
      if (!current || seen.has(current.url) || current.depth > maxDepth) continue;
      seen.add(current.url);

      const pageErrors = [];
      page.removeAllListeners('pageerror');
      page.removeAllListeners('console');
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });

      const response = await page.goto(current.url, { waitUntil: 'networkidle2', timeout: 30000 }).catch((error) => ({ error }));
      const status = typeof response?.status === 'function' ? response.status() : null;
      const title = await page.title().catch(() => '');
      const snapshot = await page.evaluate(() => {
        const visibleText = (document.body?.innerText ?? '').trim().slice(0, 1000);
        const links = [...document.querySelectorAll('a[href]')]
          .map((link) => link.href)
          .filter(Boolean);
        const buttons = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')]
          .map((element) => element instanceof HTMLInputElement ? element.value : element.textContent?.trim() ?? element.getAttribute('aria-label') ?? '')
          .filter(Boolean)
          .slice(0, 20);
        const forms = [...document.querySelectorAll('form')].map((form) => ({
          action: form.action,
          method: form.method,
          inputs: [...form.querySelectorAll('input, select, textarea')]
            .map((input) => input.getAttribute('name') ?? input.getAttribute('aria-label') ?? input.getAttribute('placeholder') ?? input.getAttribute('type') ?? input.tagName.toLowerCase())
            .filter(Boolean),
        }));
        return { visibleText, links, buttons, forms };
      }).catch(() => ({ visibleText: '', links: [], buttons: [], forms: [] }));

      pages.push({
        url: current.url,
        depth: current.depth,
        status,
        title,
        textSample: snapshot.visibleText,
        buttons: snapshot.buttons,
        forms: snapshot.forms,
        consoleErrors: pageErrors,
      });

      for (const link of snapshot.links) {
        let normalized;
        try {
          normalized = normalizeUrl(link);
        } catch {
          continue;
        }
        if (new URL(normalized).origin !== origin) continue;
        if (!seen.has(normalized) && !normalized.includes('/api/')) {
          queue.push({ url: normalized, depth: current.depth + 1 });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const result = {
    baseUrl: root,
    crawledAt: new Date().toISOString(),
    maxPages,
    maxDepth,
    pages,
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Crawled ${pages.length} page(s)`);
  console.log(`Wrote ${path.relative(projectRoot, outPath)}`);

  if (values.generate) {
    const scenariosDir = path.resolve(projectRoot, config.scenariosDir);
    await fs.mkdir(scenariosDir, { recursive: true });
    let written = 0;
    for (const pageInfo of pages.filter((item) => item.status && item.status < 400)) {
      const scenario = scenarioFor(pageInfo, root);
      const scenarioPath = path.join(scenariosDir, scenario.fileName);
      const exists = await fs.stat(scenarioPath).then(() => true).catch(() => false);
      if (exists) continue;
      await fs.writeFile(scenarioPath, scenario.content, 'utf8');
      written += 1;
    }
    console.log(`Generated ${written} crawl scenario(s)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
