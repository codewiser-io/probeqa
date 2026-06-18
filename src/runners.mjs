import { createRequire } from 'node:module';
import path from 'node:path';

const SUPPORTED_RUNNERS = new Set(['puppeteer', 'playwright']);

export function resolveRunnerName(value = 'puppeteer') {
  const runner = String(value || 'puppeteer').toLowerCase();
  if (!SUPPORTED_RUNNERS.has(runner)) {
    throw new Error(`Unsupported browser runner "${value}". Use "puppeteer" or "playwright".`);
  }
  return runner;
}

export function runnerInstallMessage(runner) {
  if (runner === 'playwright') {
    return 'Playwright is not installed. Run "npm install -D playwright" in the app repo or keep runner set to "puppeteer".';
  }
  return 'Puppeteer is not installed. Run "npm install -D probeqa" in the app repo.';
}

export async function loadBrowserRunner(projectRoot, runnerName = 'puppeteer') {
  const runner = resolveRunnerName(runnerName);
  const mod = await importFromProject(projectRoot, runner);

  if (runner === 'playwright') {
    const playwright = mod.default ?? mod;
    const chromium = playwright.chromium;
    if (!chromium?.launch) throw new Error('Installed playwright package does not expose chromium.launch.');
    return {
      name: runner,
      async launch({ headless, args, viewport }) {
        const browser = await chromium.launch({ headless, args });
        const page = await browser.newPage({ viewport });
        return { browser, page };
      },
    };
  }

  const puppeteer = mod.default ?? mod;
  return {
    name: runner,
    async launch({ headless, args, viewport }) {
      const browser = await puppeteer.launch({
        headless,
        args,
        defaultViewport: viewport,
      });
      const page = await browser.newPage();
      return { browser, page };
    },
  };
}

async function importFromProject(projectRoot, packageName) {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  try {
    return await import(packageName);
  } catch {
    try {
      return projectRequire(packageName);
    } catch (error) {
      throw new Error(`${runnerInstallMessage(packageName)} Original error: ${error.message}`);
    }
  }
}
