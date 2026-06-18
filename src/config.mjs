import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadConfig(projectRoot, options = {}) {
  const configPath = path.join(projectRoot, 'probeqa.config.json');
  const raw = await fs.readFile(configPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });

  if (!raw) {
    if (options.required) {
      throw new Error('No probeqa.config.json found. Run "probeqa init" first.');
    }
    return normalizeConfig({});
  }

  try {
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    throw new Error(`Invalid probeqa.config.json: ${error.message}`);
  }
}

export function normalizeConfig(config = {}) {
  const ignore = isObject(config.ignore) ? config.ignore : {};
  return {
    ...config,
    projects: Array.isArray(config.projects) ? config.projects : [],
    scenariosDir: config.scenariosDir ?? 'probeqa/scenarios',
    artifactsDir: config.artifactsDir ?? 'probeqa/artifacts',
    runner: config.runner ?? 'puppeteer',
    ignore: {
      console: asArray(ignore.console ?? config.ignoreConsoleErrors),
      network: asArray(ignore.network ?? config.ignoreNetworkFailures),
    },
    aiRefinement: isObject(config.aiRefinement) ? config.aiRefinement : {},
  };
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
