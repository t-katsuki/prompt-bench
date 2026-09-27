const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function request(overrides) {
  let sent;
  const context = vm.createContext({
    exports: {}, process: { env: { OPENAI_API_KEY: "test", PERPLEXITY_API_KEY: "test", GEMINI_API_KEY: "test" } },
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      sent = { url, body: JSON.parse(options.body) };
      return { ok: true, text: async () => JSON.stringify({
        choices: [{ message: { content: "OK" } }],
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
      }) };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve("../netlify/functions/llm.js"), "utf8"), context);
  const response = await context.exports.handler({ httpMethod: "POST", body: JSON.stringify({
    provider: "openai", model: "gpt-6-luna", userPrompt: "Test", temperature: 0.7, maxTokens: 1200, ...overrides,
  }) });
  return { response, sent };
}

for (const model of ["gpt-6-luna", "gpt-6-sol"]) {
  for (const effort of ["none", "low", "medium", "high", "xhigh", "max", "", null, undefined]) {
    test(`${model}, effort ${String(effort)}`, async () => {
      const { response, sent } = await request({ model, reasoning_effort: effort });
      assert.equal(response.statusCode, 200);
      assert.equal(sent.body.reasoning_effort, effort || undefined);
      assert.equal(Object.hasOwn(sent.body, "reasoning_effort"), Boolean(effort));
      assert.equal(sent.body.temperature, effort === "none" ? 0.7 : undefined);
      assert.equal(sent.body.max_completion_tokens, 1200);
      assert.equal(Object.hasOwn(sent.body, "max_tokens"), false);
    });
  }
}

test("invalid effort is rejected before an API call", async () => {
  const { response, sent } = await request({ reasoning_effort: "invalid" });
  assert.equal(response.statusCode, 400);
  assert.equal(sent, undefined);
});

for (const [provider, model] of [["openai", "gpt-4o-mini"], ["perplexity", "sonar-pro"], ["gemini", "gemini-3.1-flash-lite"]]) {
  test(`${model} retains its request parameters and omits reasoning`, async () => {
    const { response, sent } = await request({ provider, model, reasoning_effort: "none" });
    assert.equal(response.statusCode, 200);
    assert.equal(Object.hasOwn(sent.body, "reasoning_effort"), false);
    if (provider === "gemini") {
      assert.deepEqual(sent.body.generationConfig, { temperature: 0.7, maxOutputTokens: 1200 });
    } else {
      assert.equal(sent.body.temperature, 0.7);
      assert.equal(sent.body.max_tokens, 1200);
      assert.equal(Object.hasOwn(sent.body, "max_completion_tokens"), false);
    }
  });
}

test("existing GPT-5 handling is unchanged", async () => {
  const { sent } = await request({ model: "gpt-5.5", reasoning_effort: "none" });
  assert.equal(sent.body.max_completion_tokens, 1200);
  assert.equal(Object.hasOwn(sent.body, "temperature"), false);
  assert.equal(Object.hasOwn(sent.body, "reasoning_effort"), false);
});
