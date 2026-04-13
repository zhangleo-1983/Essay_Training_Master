import { GoogleGenAI } from '@google/genai';

function providerError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.retryable = false;
  return error;
}

function createRetryableError(message, statusCode = 503) {
  const error = providerError(message, statusCode);
  error.retryable = true;
  return error;
}

function getFirstDefined(...values) {
  return values.find((value) => typeof value === 'string' && value.trim());
}

function shouldRetryHttpStatus(status) {
  return [408, 409, 425, 429].includes(status) || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWithRetries(task, options) {
  const maxRetries = Number(options.maxRetries ?? 2);
  const baseDelayMs = Number(options.baseDelayMs ?? 300);
  let attemptsUsed = 0;

  while (true) {
    attemptsUsed += 1;
    try {
      const text = await task();
      return { text, attemptsUsed };
    } catch (error) {
      error.attemptsUsed = attemptsUsed;
      if (!error.retryable || attemptsUsed > maxRetries) {
        throw error;
      }

      await sleep(baseDelayMs * 2 ** (attemptsUsed - 1));
    }
  }
}

function getProviderConfig() {
  const provider = (process.env.MODEL_PROVIDER || 'gemini').trim().toLowerCase();

  if (provider === 'gemini') {
    return {
      provider,
      modelName: getFirstDefined(
        process.env.MODEL_NAME,
        process.env.GEMINI_MODEL,
        'gemini-2.5-flash',
      ),
      apiKey: getFirstDefined(process.env.AI_API_KEY, process.env.GEMINI_API_KEY),
      baseUrl: null,
      compatibilityMode: 'google-genai',
      maxRetries: Number(process.env.MODEL_MAX_RETRIES || 2),
      retryBaseDelayMs: Number(process.env.MODEL_RETRY_BASE_DELAY_MS || 300),
    };
  }

  if (provider === 'openai' || provider === 'openai-compatible' || provider === 'deepseek') {
    const defaultBaseUrl = provider === 'deepseek'
      ? 'https://api.deepseek.com/v1'
      : provider === 'openai'
        ? 'https://api.openai.com/v1'
        : null;

    return {
      provider,
      modelName: getFirstDefined(
        process.env.MODEL_NAME,
        provider === 'openai' ? process.env.OPENAI_MODEL : null,
        provider === 'deepseek' ? process.env.DEEPSEEK_MODEL : null,
      ),
      apiKey: getFirstDefined(
        process.env.AI_API_KEY,
        provider === 'openai' ? process.env.OPENAI_API_KEY : null,
        provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : null,
      ),
      baseUrl: getFirstDefined(
        process.env.AI_BASE_URL,
        provider === 'openai' ? process.env.OPENAI_BASE_URL : null,
        provider === 'deepseek' ? process.env.DEEPSEEK_BASE_URL : null,
        defaultBaseUrl,
      ),
      compatibilityMode: 'openai-chat-completions',
      maxRetries: Number(process.env.MODEL_MAX_RETRIES || 2),
      retryBaseDelayMs: Number(process.env.MODEL_RETRY_BASE_DELAY_MS || 300),
    };
  }

  throw providerError(
    `Unsupported MODEL_PROVIDER "${provider}". Use gemini, openai, deepseek, or openai-compatible.`,
    500,
  );
}

function normalizeOpenAIContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

async function generateWithGemini(config, systemInstruction, conversation, temperature) {
  if (!config.apiKey) {
    throw providerError('Gemini API key is not configured on the server.');
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  return runWithRetries(async () => {
    try {
      const response = await ai.models.generateContent({
        model: config.modelName,
        contents: conversation.map((message) => ({
          role: message.role === 'assistant' ? 'model' : message.role,
          parts: [{ text: message.content }],
        })),
        config: {
          systemInstruction,
          temperature,
        },
      });

      return response.text || '抱歉，我刚才走神了，你能再说一遍吗？';
    } catch (error) {
      const status = Number(error?.status || error?.statusCode || 0);
      const retryable = status === 0 || shouldRetryHttpStatus(status);
      const wrapped = retryable
        ? createRetryableError(error?.message || 'Gemini request failed.', status || 502)
        : providerError(error?.message || 'Gemini request failed.', status || 502);
      wrapped.cause = error;
      throw wrapped;
    }
  }, {
    maxRetries: config.maxRetries,
    baseDelayMs: config.retryBaseDelayMs,
  });
}

async function generateWithOpenAICompatible(config, systemInstruction, conversation, temperature) {
  if (!config.apiKey) {
    throw providerError(`${config.provider} API key is not configured on the server.`);
  }

  if (!config.modelName) {
    throw providerError(
      `MODEL_NAME is required when MODEL_PROVIDER is "${config.provider}".`,
      500,
    );
  }

  if (!config.baseUrl) {
    throw providerError(
      `AI_BASE_URL is required when MODEL_PROVIDER is "${config.provider}".`,
      500,
    );
  }

  return runWithRetries(async () => {
    let response;
    try {
      response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelName,
          temperature,
          messages: [
            { role: 'system', content: systemInstruction },
            ...conversation.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
        }),
      });
    } catch (error) {
      const wrapped = createRetryableError(
        `Upstream ${config.provider} network request failed.`,
        502,
      );
      wrapped.cause = error;
      throw wrapped;
    }

    if (!response.ok) {
      const details = await response.text();
      const message = `Upstream ${config.provider} request failed with ${response.status}: ${details || response.statusText}`;
      if (shouldRetryHttpStatus(response.status)) {
        throw createRetryableError(message, response.status === 429 ? 429 : 502);
      }

      throw providerError(message, response.status === 429 ? 429 : 502);
    }

    const data = await response.json();
    const text = normalizeOpenAIContent(data?.choices?.[0]?.message?.content);
    return text || '抱歉，我刚才走神了，你能再说一遍吗？';
  }, {
    maxRetries: config.maxRetries,
    baseDelayMs: config.retryBaseDelayMs,
  });
}

export function createModelGateway() {
  const config = getProviderConfig();

  return {
    provider: config.provider,
    modelName: config.modelName,
    baseUrl: config.baseUrl,
    compatibilityMode: config.compatibilityMode,
    hasApiKey: Boolean(config.apiKey),
    maxRetries: config.maxRetries,
    retryBaseDelayMs: config.retryBaseDelayMs,
    async generateReply({ systemInstruction, conversation, temperature = 0.7 }) {
      if (config.provider === 'gemini') {
        return generateWithGemini(config, systemInstruction, conversation, temperature);
      }

      return generateWithOpenAICompatible(
        config,
        systemInstruction,
        conversation,
        temperature,
      );
    },
  };
}
