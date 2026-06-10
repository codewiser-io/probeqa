export function getBrowserLaunchArgs(env = process.env) {
  const configuredArgs = (env.PROBEQA_CHROME_ARGS ?? '')
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean);
  const shouldDisableSandbox =
    env.PROBEQA_NO_SANDBOX === 'true' ||
    (env.CI === 'true' && env.PROBEQA_NO_SANDBOX !== 'false');

  if (!shouldDisableSandbox) return configuredArgs;

  return [
    ...new Set([
      ...configuredArgs,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]),
  ];
}
