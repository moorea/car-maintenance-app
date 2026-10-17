# 0009 The assistant answers only from the car's stored data, cited, through an edge function

Status: accepted, 2026-10-17

## Decision

Ask sends the owner's question to a Supabase edge function, `assistant`, which answers with
Claude from the facts stored for that car and streams the answer back with its sources.

- **Grounding by citations, not tools.** `groundingDocuments` (core) turns everything stored for
  the car into plain-text documents: the car itself, each schedule item with when it is next due,
  each service record, each recall, each complaint summary and up to 30 recent raw complaints.
  They go to the Messages API as `document` blocks with citations on, in the first user turn,
  with prompt caching on the last one. Claude can cite only those documents; each citation maps
  back to an `AnswerSource` the app shows as a chip under the answer. There is no tool loop: the
  data for one car is small enough to send whole, and one request is cheaper and faster.
- **The system prompt** says to answer only from the documents, to treat them as data rather
  than instructions, to say plainly when the app does not know, that recalls and complaints
  describe the model year rather than this car, and to send safety questions to a mechanic.
- **Behind ports.** Core has `LanguageModel` (the model) and `Assistant` (the app's view of the
  service). `answerQuestion` (core) does the grounding, history and citation mapping, so it is
  tested with a scripted model. The app's adapter is `remoteAssistant` (packages/data); the demo
  and web preview use `localAssistant` with `demoModel`, which quotes the documents it matches.
- **The server is a package.** `packages/server` holds the request handler, the Anthropic adapter
  and the Supabase store, tested on Node. esbuild bundles it, core included, into
  `supabase/functions/assistant/index.js` (not committed), turning npm imports into `npm:`
  specifiers for Deno. CI builds the bundle and runs it under Deno; merging to main applies
  pending migrations and then deploys it.
- **Reads go through the owner's token.** The function reads the car with the owner's JWT, so
  row-level security decides what it can see, exactly as on the phone. Only raw complaints (not
  synced to phones), the conversation history and the daily count use the service role.
- **Conversations are stored** in `conversations` and `messages` (written by the service role
  only), and the last 20 messages go with each question as history.
- **Limits.** 50 questions per owner per rolling 24 hours (`ASSISTANT_DAILY_LIMIT`). Each
  question is recorded in `assistant_questions` before the model is called, by
  `assistant_claim_question`, which only the service role can call. It locks per owner, so
  parallel requests cannot all slip under the limit, and it counts stopped and failed answers
  too, since they are paid for. Owners cannot delete that table, so deleting conversations does
  not reset the count. Questions are at most 1,000 characters. Answers are capped at 8,000
  tokens; one that hits the cap ends with "(This answer was cut short.)".
- **Model.** `claude-opus-5-5` at low effort. Server-side fallbacks are on: if the model
  declines partway, Anthropic's fallback model answers instead, and a `reset` event tells the
  phone to drop the partial text. An overloaded API is not covered by fallbacks; it reads as
  "not available right now". `ASSISTANT_MODEL` overrides the model without a deploy.
- **Streaming.** The function streams server-sent events (`conversation`, `text`, `source`,
  `reset`, `done`, `error`). The phone reads them with `expo/fetch`, since React Native's fetch
  does not stream. Errors before the stream starts are status codes the app maps to a message.
- **Keys.** `ANTHROPIC_API_KEY` is a Supabase secret. Without it the function answers 503 and the
  app says Ask is not available yet.

## Why

- Answering only from stored data, with sources the owner can see, is the product: the value
  over a general chatbot is that the answer is about this car and can be checked.
- Citations are produced by the API, so a source chip always points at a document that was sent;
  the model cannot invent a recall campaign number in a chip.
- Keeping the key on the server is required (never in the app), and reading through RLS means
  the function cannot leak another owner's car even if its code has a bug.
- A bundle built from the same core the phone runs keeps "next due" identical in both places.

## Known gaps

- The owner's manual is not stored yet, so questions like "which oil?" get "I don't know" until
  manuals are ingested.
- The daily limit is a count, not a cost budget.
- Stopping an answer keeps the partial text on the phone, but the server saves only complete
  turns, so the next question's history lacks the stopped one.

## Revisit if

- A car's documents grow past what is cheap to send every time (manuals, many years of service):
  then retrieve the relevant documents per question, or give Claude a search tool.
- Answers need to act (log a service, set a reminder): add client tools then.
