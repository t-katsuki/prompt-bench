const PROVIDERS = {
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    endpoint: "https://api.openai.com/v1/chat/completions",
  },
  perplexity: {
    label: "Perplexity",
    envKey: "PERPLEXITY_API_KEY",
    endpoint: "https://api.perplexity.ai/chat/completions",
  },
  gemini: {
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
  },
};

const DEFAULT_TIMEOUT_MS = 90_000;
const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"];

function supportsReasoningEffort(payload) {
  return payload.provider === "openai" && ["gpt-6-luna", "gpt-6-sol"].includes(payload.model);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "POST only. PromptBench expects a run request." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return jsonResponse(400, { error: validationError });
  }

  const provider = PROVIDERS[payload.provider];
  const apiKey = process.env[provider.envKey];

  if (!apiKey) {
    return jsonResponse(400, {
      error: `${provider.label} is not configured. Set ${provider.envKey} in Netlify environment variables to use this provider.`,
      missingEnv: provider.envKey,
    });
  }

  try {
    const result =
      payload.provider === "gemini"
        ? await callGemini(payload, apiKey)
        : await callOpenAICompatible(payload, provider, apiKey);

    return jsonResponse(200, result);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    return jsonResponse(status, {
      error: error.message || "The provider request failed.",
      provider: payload.provider,
    });
  }
};

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return "Missing request payload.";
  if (!PROVIDERS[payload.provider]) return "Choose a supported provider.";
  if (!isNonEmptyString(payload.model)) return "Choose a model.";
  if (!isNonEmptyString(payload.userPrompt)) return "USER prompt is required.";

  if (supportsReasoningEffort(payload) && payload.reasoning_effort != null &&
      payload.reasoning_effort !== "" && !REASONING_EFFORTS.includes(payload.reasoning_effort)) {
    return "Choose a supported reasoning effort.";
  }

  if (payload.systemPrompt != null && typeof payload.systemPrompt !== "string") {
    return "SYSTEM prompt must be text.";
  }

  if (!Number.isFinite(payload.temperature) || payload.temperature < 0 || payload.temperature > 2) {
    return "Temperature must be a number from 0 to 2.";
  }

  if (!Number.isInteger(payload.maxTokens) || payload.maxTokens < 1 || payload.maxTokens > 8192) {
    return "Max tokens must be an integer from 1 to 8192.";
  }

  return "";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function callOpenAICompatible(payload, provider, apiKey) {
  const messages = [];
  const systemPrompt = payload.systemPrompt?.trim();

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: payload.userPrompt.trim() });

  const requestBody = buildOpenAICompatibleRequestBody(payload, messages);

  const response = await fetchWithTimeout(provider.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await safeJson(response);

  if (!response.ok) {
    throw providerError(response.status, data);
  }

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Provider returned no message content.");
  }

  return {
    text,
    citations: Array.isArray(data.citations) ? data.citations : [],
    usage: data.usage || null,
  };
}

function buildOpenAICompatibleRequestBody(payload, messages) {
  const body = {
    model: payload.model,
    messages,
    temperature: payload.temperature,
  };

  if (payload.provider === "openai" && usesMaxCompletionTokens(payload.model)) {
    delete body.temperature;
    body.max_completion_tokens = payload.maxTokens;
    if (supportsReasoningEffort(payload) && REASONING_EFFORTS.includes(payload.reasoning_effort)) {
      body.reasoning_effort = payload.reasoning_effort;
      if (payload.reasoning_effort === "none") body.temperature = payload.temperature;
    }
    return body;
  }

  body.max_tokens = payload.maxTokens;
  return body;
}

function usesMaxCompletionTokens(model) {
  return /^gpt-[5-9](?:[.-]|$)/i.test(model.trim());
}

async function callGemini(payload, apiKey) {
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(payload.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: payload.userPrompt.trim() }],
          },
        ],
        ...(payload.systemPrompt?.trim()
          ? { systemInstruction: { parts: [{ text: payload.systemPrompt.trim() }] } }
          : {}),
        generationConfig: {
          temperature: payload.temperature,
          maxOutputTokens: payload.maxTokens,
        },
      }),
    },
  );

  const data = await safeJson(response);

  if (!response.ok) {
    throw providerError(response.status, data);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text).filter(Boolean).join("\n").trim();

  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `Gemini returned no text. Finish reason: ${reason}` : "Gemini returned no text.");
  }

  return {
    text,
    citations: [],
    usage: data.usageMetadata || null,
  };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Provider request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function providerError(status, data) {
  const message =
    data?.error?.message ||
    data?.error ||
    data?.message ||
    data?.raw ||
    `Provider returned HTTP ${status}.`;
  const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
  error.status = status >= 400 && status < 500 ? status : 502;
  return error;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
