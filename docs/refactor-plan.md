# Effect v4 refactor

## Requested behavior

Use native Effect v4 TypeScript, separate the speech engine from independently
registered replacers, follow URL Migrations' ordered rule list and optional
matching, and support provider-independent LLM narration of Markdown tables.
Only spoken text may change. Preserve install/status/remove and page reloads.

## Findings and design

- URL Migrations exposes an ordered array of small rules, optional `matches`,
  and a result describing whether the input changed. Adopt those conventions.
- Claude's audited Read aloud engine strips table pipes and separator rows
  **before** sending WebSocket frames. The old interception point cannot
  reliably recognize tables. Intercept the engine's `speak` input instead.
- Replacers return Effects. The pipeline owns ordering, timeouts, change reports,
  and fallback to the previous text if a replacer fails. Register them only in
  `speech.config.ts`; extending a replacer never requires changing the engine.
- Parse GFM tables with a Markdown parser and source offsets. Send only table
  text to `LanguageModel`; preserve surrounding source. Ignore fenced examples.
- Keep model configuration and credentials in the main process. A scoped
  Electron debugger binding connects the renderer adapter to the Effect pipeline.
  The renderer owns cancellation of pending playback; stale responses cannot
  restart audio after Stop or a later Read aloud request.
- Discover the current speech module through the loaded first-party loader,
  rather than pinning a hashed filename. This private Claude integration remains
  version-sensitive and separate from the public transformation interface.
- Use Effect services/Layers, Config/Redacted, Schema, scoped resources,
  Effect CLI, HttpClient, and platform process/file services. Promise bridging
  belongs only at Electron/browser/Bun APIs.

## Validation

Public pipeline tests own registration, ordering, failure/timeout policy and
dependency inference. Markdown tests own table-only rewriting and provider wire
behavior. Adapter tests own the speech-only input seam, Stop/supersession,
restore/reapply, and module discovery. Typecheck and build both runtime targets.
Validate the actual Claude adapter if the running app permits it; report clearly
whether a real provider and audible playback were exercised.

## References

- https://github.com/gruckion/url-migrations
- Installed `effect@4.0.1/AGENTS.md` and `ai-docs`: services/Layers, resources,
  HttpClient, child processes, CLI, ManagedRuntime, and LanguageModel.
- Audited Claude Desktop 2.26454.0 Read aloud module and its first-party loader.
