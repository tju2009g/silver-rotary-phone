// List prices in USD per 1M tokens: [input, output, cache read, cache write (5-minute)].
// Used only to ESTIMATE cost per review for the usage log; reconcile with your Anthropic invoice.
// Fallback models appear here because a refused request can be completed by another model.
export const PRICES = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-sonnet-5-5": [2, 10, 0.1, 2.5],
  "claude-opus-5": [5, 25, 0.5, 6.25],
  "claude-opus-4-8": [5, 25, 0.5, 6.25],
  "claude-sonnet-5": [2, 10, 0.2, 2.5]
};

export function costUsd(model, u) {
  if (!u) return 0;
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => String(model || "").startsWith(k));
  if (!key) return null;
  const [i, o, cr, cw] = PRICES[key];
  const c = ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * cr + (u.cache_creation_input_tokens || 0) * cw) / 1e6;
  return Math.round(c * 10000) / 10000;
}
