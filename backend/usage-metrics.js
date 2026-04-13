function parsePricingConfig() {
  const raw = process.env.MODEL_PRICING_JSON?.trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function estimateTokensFromChars(charCount) {
  if (!Number.isFinite(charCount) || charCount <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(charCount / 4));
}

function getPricingEntry(pricingConfig, provider, modelName) {
  const keys = [
    `${provider}:${modelName}`,
    `${provider}:*`,
    `*:${modelName}`,
    '*:*',
  ];

  for (const key of keys) {
    if (pricingConfig[key]) {
      return pricingConfig[key];
    }
  }

  return null;
}

export function createUsageMetricsCalculator() {
  const pricingConfig = parsePricingConfig();

  return {
    pricingConfig,
    calculate({ provider, modelName, requestChars, responseChars }) {
      const requestTokensEstimate = estimateTokensFromChars(requestChars);
      const responseTokensEstimate = estimateTokensFromChars(responseChars);
      const pricing = getPricingEntry(pricingConfig, provider, modelName);

      let estimatedCost = null;
      let costCurrency = null;

      if (pricing) {
        const inputPer1k = Number(pricing.inputPer1kTokens || 0);
        const outputPer1k = Number(pricing.outputPer1kTokens || 0);
        estimatedCost = (
          (requestTokensEstimate / 1000) * inputPer1k +
          (responseTokensEstimate / 1000) * outputPer1k
        );
        costCurrency = pricing.currency || 'USD';
      }

      return {
        requestTokensEstimate,
        responseTokensEstimate,
        estimatedCost,
        costCurrency,
      };
    },
  };
}
