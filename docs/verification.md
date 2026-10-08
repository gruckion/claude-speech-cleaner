# Refactor verification

Verified on 8 October 2026 with Bun 1.4.2, Effect 4.0.1 and Claude Desktop 2.26454.2.

- `bun run check`: formatting, strict TypeScript, eight tests (26 assertions),
  browser and desktop bundles passed.
- The actual Claude speech engine sent `Read my project/release notes.md.` from
  the synthetic input `Read my_project/release-notes.md.` and received 146 audio
  frames. No conversation message was edited or submitted for this check.
- Reapplication installed one active hook with zero failures. The final build
  was applied after review fixes.
- A deliberately interrupted, never-resolving inspector evaluation still closed
  the main-process inspector. Its endpoint was unreachable afterwards.
- Provider tests exercised the actual Effect OpenAI-compatible adapter against a
  local HTTP server, including authentication, model, table-only prompt and
  rejection of truncated output. No paid model was used. AI narration remains
  disabled until the user configures a provider; these tests do not establish
  real-model fidelity, latency or audible table narration.

## Standards review

Independent review found three issues: sequential debugger shutdown could be
skipped on interruption; the application engine hard-coded a rule's service;
and a cached speech-module URL could outlive its document. All were corrected:
shutdown is a bounded scoped finalizer, the engine captures generic service
requirements, and each injection discovers the current module with a document
generation guard. Focused re-review found no remaining actionable findings.

## Spec review

Independent review found two overlapping gaps: new service-backed replacers
required engine edits, and reloading could retain an old Claude module. Registry
and service composition now live in `speech.config.ts`, and discovery refreshes
per document. Focused re-review found no additional actionable findings.

Standards: 3 findings resolved, 0 outstanding. Spec: 2 findings resolved,
0 outstanding. Live-provider narration is still a validation limitation.
