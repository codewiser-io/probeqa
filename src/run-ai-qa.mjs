import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getBrowserLaunchArgs } from './browser.mjs';
import { loadConfig } from './config.mjs';
import {
  buildIgnoreRules,
  filterIgnoredConsoleErrors,
  filterIgnoredNetworkFailures,
  networkFailureText,
} from './ignore-rules.mjs';
import { readResponseStatus, responseLooksOk } from './responses.mjs';
import { loadBrowserRunner, resolveRunnerName } from './runners.mjs';

async function loadScenarios(projectRoot, config) {
  const scenariosDir = path.resolve(projectRoot, config.scenariosDir);
  const entries = await fs.readdir(scenariosDir).catch((error) => {
    if (error.code === 'ENOENT') {
      throw new Error(`No scenarios directory found at ${path.relative(projectRoot, scenariosDir)}. Run "probeqa init" first.`);
    }
    throw error;
  });
  const files = entries
    .filter((entry) => entry.endsWith('.mjs') && !entry.startsWith('_'))
    .sort();

  const scenarios = [];
  for (const file of files) {
    const modulePath = path.join(scenariosDir, file);
    const mod = await import(pathToFileURL(modulePath).href);
    if (!mod.default?.id || typeof mod.default.run !== 'function') {
      throw new Error(`${file} must export default { id, title, run }`);
    }
    scenarios.push({ ...mod.default, file });
  }
  return scenarios;
}

export function createExpect(page, pageErrors, networkFailures, options = {}) {
  const ignoreRules = buildIgnoreRules(options.ignore ?? {});
  return {
    ok(value, message) {
      if (!value) throw new Error(message);
    },
    async visibleText(pattern) {
      const found = await pageTextMatches(page, pattern);
      if (!found) throw new Error(`Expected visible text matching ${pattern}`);
    },
    responseOk(response, message) {
      if (!responseLooksOk(response)) {
        throw new Error(`${message}: ${readResponseStatus(response)}`);
      }
    },
    responseStatusIn(response, statuses, message) {
      const status = readResponseStatus(response);
      if (!statuses.includes(status)) {
        throw new Error(`${message}: ${status}`);
      }
    },
    noBrowserErrors() {
      const badErrors = filterIgnoredConsoleErrors(pageErrors, ignoreRules);
      if (badErrors.length > 0) {
        throw new Error(`Browser errors:\n${badErrors.join('\n')}`);
      }
      const badFailures = filterIgnoredNetworkFailures(networkFailures, ignoreRules);
      if (badFailures.length > 0) {
        throw new Error(`Network failures:\n${badFailures.map((failure) => networkFailureText(failure)).join('\n')}`);
      }
    },
  };
}

async function pageTextMatches(page, pattern) {
  return page.evaluate((source, flags) => {
    const regex = new RegExp(source, flags);
    const text = document.body?.innerText ?? '';
    return regex.test(text);
  }, pattern.source, pattern.flags);
}

export { getBrowserLaunchArgs };
export { readResponseStatus, responseLooksOk };

export async function clickByText(page, pattern) {
  const handles = await page.$$('a, button, [role="button"], input[type="submit"]');
  for (const handle of handles) {
    const metadata = await handle.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const text =
        element instanceof HTMLInputElement
          ? element.value
          : element.textContent ?? element.getAttribute('aria-label') ?? '';
      return {
        text: text.trim(),
        visible:
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0,
      };
    });

    if (metadata.visible && pattern.test(metadata.text)) {
      await handle.click();
      return metadata.text;
    }
  }
  return null;
}

async function runScenario(browserRunner, scenario, options, projectRoot, config) {
  const artifactsDir = path.resolve(projectRoot, config.artifactsDir);
  const headless = options.headless !== 'false';
  const { browser, page } = await browserRunner.launch({
    headless,
    args: getBrowserLaunchArgs(),
    viewport: { width: 1440, height: 1000 },
  });

  const pageErrors = [];
  const networkFailures = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    networkFailures.push({
      method: request.method(),
      url: request.url(),
      error: requestFailureText(request),
    });
  });

  const steps = [];
  const startedAt = Date.now();
  const context = {
    page,
    baseUrl: options.baseUrl.replace(/\/$/, ''),
    backendUrl: options.backendUrl.replace(/\/$/, ''),
    expect: createExpect(page, pageErrors, networkFailures, { ignore: config.ignore }),
    clickByText: (pattern) => clickByText(page, pattern),
    step: async (name, fn) => {
      const stepStartedAt = Date.now();
      await fn();
      steps.push({ name, ms: Date.now() - stepStartedAt });
      console.log(`    ok ${name}`);
    },
  };

  try {
    await scenario.run(context);
    context.expect.noBrowserErrors();
    return { status: 'passed', ms: Date.now() - startedAt, steps };
  } catch (error) {
    await fs.mkdir(artifactsDir, { recursive: true });
    const screenshotPath = path.join(artifactsDir, `${scenario.id}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      status: 'failed',
      ms: Date.now() - startedAt,
      steps,
      error: error.stack ?? error.message,
      screenshotPath,
    };
  } finally {
    await browser.close();
  }
}

function requestFailureText(request) {
  const failure = request.failure?.();
  if (typeof failure === 'string') return failure;
  return failure?.errorText ?? 'unknown failure';
}

export async function main(argv = process.argv.slice(2), projectRoot = process.cwd()) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      list: { type: 'boolean', default: false },
      scenario: { type: 'string', short: 's' },
      baseUrl: { type: 'string', default: process.env.AI_QA_BASE_URL ?? 'http://localhost:3000' },
      backendUrl: { type: 'string', default: process.env.AI_QA_BACKEND_URL ?? 'http://localhost:3001' },
      headless: { type: 'string', default: process.env.AI_QA_HEADLESS ?? 'true' },
      runner: { type: 'string', default: process.env.PROBEQA_RUNNER },
    },
  });
  const config = await loadConfig(projectRoot);
  const selectedScenario = values.scenario ?? positionals[0];
  const scenarios = await loadScenarios(projectRoot, config);
  const runnable = selectedScenario
    ? scenarios.filter((scenario) => scenario.id === selectedScenario || scenario.file === selectedScenario)
    : scenarios;

  if (values.list) {
    for (const scenario of scenarios) {
      console.log(`${scenario.id} - ${scenario.title}`);
    }
    return;
  }

  if (runnable.length === 0) {
    throw new Error(`No scenario matched ${selectedScenario}`);
  }

  const runnerName = resolveRunnerName(values.runner ?? config.runner);
  const browserRunner = await loadBrowserRunner(projectRoot, runnerName);

  const results = [];
  for (const scenario of runnable) {
    console.log(`\n[${scenario.id}] ${scenario.title}`);
    const result = await runScenario(browserRunner, scenario, values, projectRoot, config);
    results.push({ scenario, result });
    const marker = result.status === 'passed' ? 'PASS' : 'FAIL';
    console.log(`${marker} ${scenario.id} (${result.ms}ms)`);
    if (result.status === 'failed') {
      console.error(result.error);
      console.error(`Screenshot: ${result.screenshotPath}`);
    }
  }

  const failed = results.filter(({ result }) => result.status === 'failed');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
