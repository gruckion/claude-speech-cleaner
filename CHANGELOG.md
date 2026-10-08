# Changelog

## 2.2.0 — 2026-10-08

- Classify fenced contents with separately opt-in Jev Choice/Noul questions. Read
  prose, mixed and uncertain blocks directly; explain confidently classified code
  and data with the existing narrator. Without Jev, enabled blocks read directly.
- Preserve audible contents on classification/narration failure or deadlines,
  unwrap nested/generated fences, and remove the added “Code summary” label.
- Clean underscores in backtick-wrapped snake_case identifiers, including function
  names, while preserving command flags and negative numbers.

## 2.1.1 — 2026-10-08

- Render expected debugger failures through Effect CLI user errors instead of
  runtime stack traces. Explain how to enable the debugger and show the exact
  apply/remove/status command to retry while preserving a nonzero exit status.
- Distinguish initial connection failure from interruption or timeout after an
  operation may have started, and retain scoped debugger cleanup.

## 2.1.0 — 2026-10-08

- Add separately opt-in code-block explanations before Claude removes code fences
  for speech, using the same configured provider as table narration.
- Keep code parsing and narration separate from the engine; share provider
  composition and completion validation with table narration.
- Add an optional reasoning-effort setting for compatible providers to reduce
  latency. Preserve original speech input on disabled, failed or truncated calls.

## 2.0.2 — 2026-10-08

- Limit filename cleanup to Markdown inline code containing a filename or path.
  Hyphens and underscores in those references become spaces; ordinary prose,
  numbers, commands, variables and code blocks keep their original text.
- Recognize inline code with the Markdown parser, including multi-backtick spans,
  rather than treating fenced examples or escaped backticks as file references.

## 2.0.1 — 2026-10-08

First public experimental release for Claude Desktop on macOS.

- Preserve numeric signs, ranges and scientific notation while splitting
  underscores and hyphens between letters for speech.
- Support installation from paths containing spaces and non-ASCII characters.
- Add regression tests for both fixes and CI on macOS and Linux with Bun 1.4.2.
- Add contributor guidance, private vulnerability reporting instructions,
  community conduct rules, and issue/PR templates.

## 2.0.0 — 2026-10-08

- Move the pipeline to Effect 4 TypeScript with independent registered replacers.
- Add opt-in AI narration of Markdown tables through an OpenAI-compatible provider.
- Add scoped debugger cleanup, cancellation, module discovery, and speech-only
  transformation before Claude's Markdown processing.

## 1.0.0

- Initial local JavaScript speech cleanup and reapplication helper.
