# Code-block speech audit

Audited 8 October 2026. This note concerns Claude Desktop Read aloud; it does
not establish how the native iPhone app implements speech.

## Where the placeholder comes from

The npm registry package `@anthropic-ai/claude-code@2.1.293` was downloaded and
unpacked without running installation scripts. Its JavaScript entry point is a
launcher for platform-specific native binaries, rather than the older monolithic
CLI JavaScript. No Read aloud implementation was found in the launcher files;
this audit did not reverse-engineer those native binaries.

The relevant implementation is in previously captured first-party Desktop
JavaScript from Claude Desktop 2.26454.2. Its Markdown speech cleaner contains:

````js
text.replace(/```[\s\S]*?```/g, " (code block) ");
````

Executing the extracted pure cleaner against a synthetic fenced function produced
“(code block)” between the surrounding paragraphs. The speech engine calls this
cleaner after receiving raw Markdown. Our existing `speak` wrapper runs before
that cleanup, so a replacer can substitute prose before the fence disappears.
The cached Desktop loader independently contains the same replacement. A fresh
fetch of the cached asset URL returned HTTP 403; compatibility evidence here is
from the captured source, not a newly downloaded Desktop bundle.

## Implementation

`src/replacers/codeBlocks.ts` parses Markdown code nodes and replaces their exact
source spans. `src/ai/CodeNarrator.ts` owns the explanation instructions. The
narrator uses Effect's `LanguageModel` service, provided through the same Layer as
table narration. Shared completion checks reject empty or truncated output.
The engine and renderer speech hook required no edits.

`SPEECH_AI_ENABLED=true` and `SPEECH_AI_CODE_ENABLED=true` are both required to
send code. Each provider request contains only one recognized code block and the
narration instructions. Neither source execution nor conversation modification
is involved. Failed rules restore their original input; Claude's own cleanup
then determines the fallback speech.

## Verification

- `bun run check`: 12 tests, 45 assertions, formatting, types and both bundles pass.
- Synthetic provider tests exercise the real Effect HTTP adapter, exact block-only
  payloads, separate opt-in, shared provider settings and truncated-output fallback.
- Markdown tests cover backtick/tilde fences, indented blocks, source preservation
  and recovery when a later block fails.
- A live OpenAI `gpt-6-luna` request explained multiplication and negative-quantity
  validation correctly. Default reasoning was close to the four-second rule
  deadline and one preview fell back. With the explicitly configured
  `SPEECH_AI_REASONING_EFFORT=none`, the same full preview succeeded.
- These checks do not prove narration accuracy or latency for arbitrary code,
  nor do they constitute audible verification of the new code narration.
