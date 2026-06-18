const PROVIDERS = new Set(['none', 'openai', 'anthropic', 'local']);

export function normalizeAiRefinement(config = {}, overrides = {}) {
  const enabled = overrides.enabled ?? config.enabled ?? false;
  const provider = String(overrides.provider ?? config.provider ?? (enabled ? 'local' : 'none')).toLowerCase();
  if (!PROVIDERS.has(provider)) {
    throw new Error(`Unsupported AI refinement provider "${provider}". Use openai, anthropic, local, or none.`);
  }

  return {
    enabled,
    provider,
    model: overrides.model ?? config.model,
    endpoint: overrides.endpoint ?? config.endpoint,
    apiKeyEnv: overrides.apiKeyEnv ?? config.apiKeyEnv,
  };
}

export async function refineScenarioDraft({
  scenario,
  plan,
  aiRefinement = {},
  overrides = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const settings = normalizeAiRefinement(aiRefinement, overrides);
  if (!settings.enabled || settings.provider === 'none') {
    return { scenario, changed: false, reason: 'AI refinement disabled' };
  }
  if (typeof fetchImpl !== 'function') {
    return { scenario, changed: false, reason: 'fetch is not available in this Node runtime' };
  }

  const prompt = buildRefinementPrompt({ scenario, plan });
  const request = buildProviderRequest(settings, prompt, env);
  if (!request.ok) {
    return { scenario, changed: false, reason: request.reason };
  }

  try {
    const response = await fetchImpl(request.endpoint, request.options);
    if (!response.ok) {
      return { scenario, changed: false, reason: `${settings.provider} returned HTTP ${response.status}` };
    }
    const text = await extractScenarioText(response);
    if (!looksLikeScenarioSource(text)) {
      return { scenario, changed: false, reason: `${settings.provider} response did not include scenario source` };
    }
    return {
      scenario: { ...scenario, content: `${text.trim()}\n` },
      changed: true,
      provider: settings.provider,
    };
  } catch (error) {
    return { scenario, changed: false, reason: error.message };
  }
}

export function buildRefinementPrompt({ scenario, plan }) {
  return `Refine this ProbeQA Puppeteer scenario draft.

Keep the output as plain executable .mjs source code.
Return only the complete scenario source, with no Markdown fence.

Plan:
${plan}

Draft:
${scenario.content}`;
}

export function buildProviderRequest(settings, prompt, env = process.env) {
  if (settings.provider === 'openai') {
    const apiKeyEnv = settings.apiKeyEnv ?? 'OPENAI_API_KEY';
    const apiKey = env[apiKeyEnv];
    if (!apiKey) return { ok: false, reason: `Missing ${apiKeyEnv}` };
    return {
      ok: true,
      endpoint: settings.endpoint ?? 'https://api.openai.com/v1/responses',
      options: {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.model ?? 'gpt-4.1-mini',
          input: prompt,
        }),
      },
    };
  }

  if (settings.provider === 'anthropic') {
    const apiKeyEnv = settings.apiKeyEnv ?? 'ANTHROPIC_API_KEY';
    const apiKey = env[apiKeyEnv];
    if (!apiKey) return { ok: false, reason: `Missing ${apiKeyEnv}` };
    return {
      ok: true,
      endpoint: settings.endpoint ?? 'https://api.anthropic.com/v1/messages',
      options: {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.model ?? 'claude-3-5-haiku-latest',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    };
  }

  const endpoint = settings.endpoint ?? env.PROBEQA_LOCAL_AI_URL;
  if (!endpoint) return { ok: false, reason: 'Missing local AI endpoint. Set aiRefinement.endpoint or PROBEQA_LOCAL_AI_URL.' };

  return {
    ok: true,
    endpoint,
    options: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        prompt,
      }),
    },
  };
}

export async function extractScenarioText(response) {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!contentType.includes('application/json')) return response.text();

  const json = await response.json();
  if (typeof json.scenario === 'string') return json.scenario;
  if (typeof json.content === 'string') return json.content;
  if (typeof json.text === 'string') return json.text;
  if (typeof json.output_text === 'string') return json.output_text;

  const openAiText = json.output?.flatMap((item) => item.content ?? []).find((item) => typeof item.text === 'string')?.text;
  if (openAiText) return openAiText;

  const anthropicText = json.content?.find?.((item) => typeof item.text === 'string')?.text;
  if (anthropicText) return anthropicText;

  return '';
}

function looksLikeScenarioSource(text) {
  return typeof text === 'string' && /export\s+default/.test(text) && /async\s+run/.test(text);
}
