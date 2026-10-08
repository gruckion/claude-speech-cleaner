# Changelog

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
