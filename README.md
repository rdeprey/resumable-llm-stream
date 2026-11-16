# Resume an interrupted LLM stream

[Try the browser demo](https://rdeprey.github.io/resumable-llm-stream/). Start a generation and let it disconnect at chunk 5. Watch the generator log advance while the transcript pauses. Reconnect to replay the missing text.

GitHub Pages runs a simulation in memory. The local edition uses an HTTP streaming connection and saves each chunk in SQLite. Both use the same event reducer and a deterministic answer, so you can compare the recovered text without a model API key.

## Run locally

With Node.js 25, run `node server.mjs`, then open http://127.0.0.1:4173. No package installation is required.

Run `node --test --test-timeout=5000 stream.test.mjs` to exercise reconnect during generation, duplicate delivery, and completion while the client is offline.
