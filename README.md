# Prompt Lab

A local, single-user web app for iterating on a system prompt against a fixed set of test inputs until it produces the outputs you want.

**Loop:** enter test inputs → write a system prompt → Run All in parallel → rate and comment each output → an improver model rewrites the prompt with a diagnosis and changelog → one click promotes it to the next version and reruns the same inputs, so you can compare versions.

## Run it

```bash
cp .env.example .env   # add the keys you have
npm install
npm run dev            # http://localhost:3000
```

Only providers with a key in `.env` appear in the UI. Keys are read server-side only; every LLM call goes through the Next.js route handlers in `app/api/*`, so keys never reach the browser.

Supported providers: OpenAI, Anthropic, Google Gemini, DeepSeek, Groq. Model lists come from each provider's live list-models API (cached per browser session, with a refresh button) plus a "Custom model ID" option. Optional `*_BASE_URL` variables point a provider at a proxy or gateway.

## Using it

| Column | What it does |
| --- | --- |
| 1. Inputs | One test case per row. Paste many lines into any row to fill downward (empty lines dropped). Separate multi-line inputs with a line containing only `---`. **Holdout** rows run but are never sent to the improver. |
| 2. System prompt | Provider, model, temperature, max tokens (blank = provider default), version selector. Old versions open read-only with **Restore as current**. |
| 3. Outputs | Status, latency, tokens, per-row Re-run/Retry. Editing an output marks it **Edited = ideal**: the improver gets the original as what the model did and your edit as what you wanted. After a version change, the history icon shows the previous version's output. |
| 4. Feedback | Good / OK / Bad plus a comment. Good ratings tell the improver what not to break. |
| 5. Overall context | The big picture for the improver, the improver model picker (independent of the test model), and **Generate Better Prompt**. |
| 6. New prompt | Prompt, Diff, Diagnosis, Changes, Risks & questions. **Use as v{n+1} & re-run** promotes the prompt, keeps inputs and holdout flags, clears ratings and comments, and reruns everything. |

Rows in columns 1, 3 and 4 share one CSS grid, so they always line up; each row is a fixed 160px with internal scroll, and the expand icon opens the whole row in a drawer. Columns resize by dragging header borders and collapse to a labelled strip.

**Shortcuts:** `Cmd/Ctrl+Enter` runs all rows. `Cmd/Ctrl+Shift+Enter` generates the better prompt. `Esc` closes the drawer or modal.

**Settings** holds the improver meta-prompt (editable, with Reset to default) and the improver's max output tokens.

## Persistence

Everything (sessions, versions, inputs, outputs, feedback, layout) autosaves to `localStorage`. Use the `⋯` menu next to the session picker to create, rename, duplicate or delete sessions. Export/Import moves a session as JSON.

## How the improver request is built

`lib/improver.ts` builds the user message in labelled sections: `CURRENT_SYSTEM_PROMPT`, `TARGET_MODEL`, `OVERALL_CONTEXT`, `TEST_CASES` and `VERSION_HISTORY` (last 3 versions: prompt, rating counts, comments, diagnosed patterns). Holdout rows are removed on the server, whatever the client sends. If the reply isn't valid JSON it retries once with a request for valid JSON; if that fails too, the raw text is shown in the Prompt tab.

In dev mode (`npm run dev`) the server logs the full improver payload, including which rows were sent and which holdout rows were excluded.

## Layout

```
app/api/providers   providers that have a key
app/api/models      live model list for a provider
app/api/generate    one test run: generate(provider, model, system, user, settings)
app/api/improve     builds the improver message, logs it in dev, parses/retries JSON
lib/server/providers.ts   the single generate()/listModels() interface (server-only)
lib/store.ts        zustand store persisted to localStorage
lib/runner.ts       concurrency-capped runs and the improver call
components/         grid, cells, panels, drawer, settings
```

## Checks

```bash
npm test          # paste splitting, line diff, improver message (holdout exclusion) and JSON parsing
npm run typecheck
npm run build
```
