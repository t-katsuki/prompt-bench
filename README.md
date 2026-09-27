# PromptBench

PromptBench is a small personal web tool for prompt A/B testing across OpenAI, Perplexity, and Gemini. It keeps SYSTEM and USER prompts separate, sends requests through Netlify Functions, and shows every run as an in-page history item.

The browser never receives API keys. Provider keys are read only inside `netlify/functions/llm.js` from Netlify environment variables.

## Features

- Provider and model selection for OpenAI, Perplexity, and Gemini
- Separate SYSTEM prompt and USER prompt fields
- Temperature and max token controls
- GPT-6 Luna / Sol reasoning effort selection (default `none`), recorded in history
- Run history with provider, model, timestamp, SYSTEM prompt, and result text
- Fail-soft provider setup: only the selected provider needs its key configured
- Perplexity `sonar-pro` included for FLIP NEWS prompt testing

## Local setup

1. Install Node.js 18 or newer.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Copy the environment template:

   ```sh
   cp .env.example .env
   ```

4. Add only the keys you have to `.env`:

   ```sh
   OPENAI_API_KEY=
   PERPLEXITY_API_KEY=
   GEMINI_API_KEY=
   ```

5. Run locally with Netlify Functions:

   ```sh
   npm run dev
   ```

6. Open the local URL printed by Netlify CLI, choose a provider/model, enter SYSTEM and USER prompts, and run.

If a provider key is missing, only that provider returns a clear configuration error. Providers with configured keys continue to work.

## GitHub publishing

The recommended repository name is `prompt-bench`.

1. In the `PROMPT_BENCH` folder, initialize Git if needed:

   ```sh
   git init
   ```

2. Confirm `.gitignore` excludes `.env` and `.env.*`, while keeping `.env.example`.
3. Create a GitHub repository named `prompt-bench`.
4. Push this project to GitHub.
5. Users can fork the repository, add their own provider keys in Netlify environment variables, and deploy their fork.

Never commit a real `.env` file or API key.

## Netlify deployment

1. In Netlify, choose **Add new site** -> **Import an existing project**.
2. Connect the GitHub `prompt-bench` repository.
3. Use the included `netlify.toml`. It publishes the static root and sets Functions to `netlify/functions`.
4. In **Site settings** -> **Environment variables**, add any keys you have:

   ```sh
   OPENAI_API_KEY
   PERPLEXITY_API_KEY
   GEMINI_API_KEY
   ```

5. Deploy the site.
6. Set a lowercase Netlify subdomain such as `prompt-bench.netlify.app`, or use another available lowercase name like `prompt-bench-app`.

## Implementation notes

- OpenAI uses `https://api.openai.com/v1/chat/completions`.
- Perplexity uses `https://api.perplexity.ai/chat/completions` with OpenAI-compatible messages.
- Gemini uses `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `systemInstruction` and `contents`.
- The app does not persist history to `localStorage`; runs disappear when the page is closed.

## Model review (2026-09-27)

- Added [`gpt-6-luna`](https://developers.openai.com/api/docs/models/gpt-6-luna) and [`gpt-6-sol`](https://developers.openai.com/api/docs/models/gpt-6-sol). Both support `none`, `low`, `medium`, `high`, `xhigh`, and `max` reasoning effort. This UI enables reasoning effort only for these verified model IDs; unsupported models and unselected values omit the parameter.
- Chat Completions is retained. GPT-6 sends temperature only with explicit `none`; other efforts and an omitted effort omit temperature. See [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model). GPT-6 uses `max_completion_tokens`, which includes reasoning tokens: [token limits](https://developers.openai.com/api/docs/guides/token-counting).
- The [Perplexity Sonar catalog](https://docs.perplexity.ai/docs/sonar/models) lists the four models already present. No additional Sonar models were needed. Router, Agent, and embedding APIs are outside this text-completion integration.
- New Gemini text models found: [`gemini-3.8-flash`](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [`gemini-3.7-flash`](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash), [`gemini-3.6-flash`](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash), and [`gemini-3.5-flash-lite`](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). Additions are deferred under the task's instruction to report parameter changes rather than implement them. The existing adapter sends temperature, whereas the [current migration checklist](https://ai.google.dev/gemini-api/docs/generate-content/latest-model?hl=en) requires removing sampling parameters. The [earlier 3.6 / 3.5 Flash-Lite migration guide](https://ai.google.dev/gemini-api/docs/generate-content/latest-model?hl=es-419) also documents this change. Existing Gemini models remain available and unchanged. Audio, image, video, and Live models are outside this text summarization workbench.

Validation: `node --check netlify/functions/llm.js` and `node --test tests/llm.test.js`. Live smoke tests through `netlify dev` returned HTTP 200 and text for GPT-6 Luna / Sol (`none`), GPT-4o mini, Sonar Pro, and Gemini 3.1 Flash-Lite. No new Perplexity or Gemini model was added, so new-model live tests for those providers do not apply.
