const DEFAULT_NETWORK_IGNORE = ['/_next/webpack-hmr/'];

export function buildIgnoreRules(config = {}) {
  const source = config.ignore ?? config;
  return {
    console: normalizeIgnorePatterns(source.console),
    network: [
      ...normalizeIgnorePatterns(DEFAULT_NETWORK_IGNORE),
      ...normalizeIgnorePatterns(source.network),
    ],
  };
}

export function normalizeIgnorePatterns(patterns = []) {
  const values = Array.isArray(patterns) ? patterns : [patterns];
  return values
    .map((pattern) => normalizeIgnorePattern(pattern))
    .filter(Boolean);
}

export function filterIgnoredConsoleErrors(errors, ignoreRules = {}) {
  const patterns = normalizeIgnorePatterns(ignoreRules.console);
  return errors.filter((error) => !matchesAny(error, patterns));
}

export function filterIgnoredNetworkFailures(failures, ignoreRules = {}) {
  const patterns = normalizeIgnorePatterns(ignoreRules.network);
  return failures.filter((failure) => {
    const text = networkFailureText(failure);
    return !matchesAny(failure.url, patterns) && !matchesAny(failure.error, patterns) && !matchesAny(text, patterns);
  });
}

export function networkFailureText(failure) {
  return `${failure.method ?? 'GET'} ${failure.url ?? ''}: ${failure.error ?? 'unknown failure'}`;
}

function normalizeIgnorePattern(pattern) {
  if (pattern && typeof pattern === 'object' && pattern.type && pattern.value) {
    return pattern;
  }
  if (typeof pattern === 'string') {
    const regex = regexFromSlashPattern(pattern);
    return regex ?? { type: 'substring', value: pattern };
  }
  if (pattern && typeof pattern === 'object' && typeof pattern.pattern === 'string') {
    return {
      type: 'regex',
      value: new RegExp(pattern.pattern, pattern.flags ?? ''),
    };
  }
  return null;
}

function regexFromSlashPattern(pattern) {
  const match = pattern.match(/^\/(.+)\/([a-z]*)$/i);
  if (!match) return null;
  return { type: 'regex', value: new RegExp(match[1], match[2]) };
}

function matchesAny(value, patterns) {
  const text = String(value ?? '');
  return patterns.some((pattern) => {
    if (pattern.type === 'regex') return pattern.value.test(text);
    return text.includes(pattern.value);
  });
}
