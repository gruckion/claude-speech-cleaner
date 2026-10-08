# Claude speech cleaner

[![CI](https://github.com/gruckion/claude-speech-cleaner/actions/workflows/ci.yml/badge.svg)](https://github.com/gruckion/claude-speech-cleaner/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An **Effect 4 TypeScript** pipeline for making Claude Desktop's Read aloud easier
to follow. It changes only the text passed to speech: conversation history,
generated code, files, clipboard and keyboard input stay untouched.

- Read separators in backtick-wrapped filenames, paths and snake_case identifiers as spaces.
- Read unquoted file paths as words and omit Markdown blockquote markers from speech.
- Shorten contextually identified hashes to “hash ending c541” using opt-in Jev classification.
- Turn Markdown tables into spoken prose using an LLM.
- Read fenced prose directly; classify actual code with Jev before asking an LLM to explain it.
- Add named, independently testable replacers in one registration file.

https://github.com/user-attachments/assets/f24a794a-db2a-4b1a-8fa9-61fb0790688e

This is an unofficial macOS runtime modification, not a Claude Code plugin or an
Anthropic-supported extension. It leaves Claude's installed files unchanged.
**Experimental:** tested with Claude Desktop 2.26454.2. Private Claude interfaces
can change. The native iPhone app's Read aloud is not modified.

## Install and enable

Requires macOS, Claude at `/Applications/Claude.app`, Git and
[Bun](https://bun.sh) 1.4.2 or newer. CI uses Bun 1.4.2.

```sh
git clone https://github.com/gruckion/claude-speech-cleaner.git
cd claude-speech-cleaner
bun install --frozen-lockfile
bun run apply
```

In Claude, enable **Help → Troubleshooting → Enable Developer Mode** once. This
restarts Claude, so finish active work first. Then open a conversation and choose
**Developer → Enable Main Process Debugger** when the command asks. It waits up
to two minutes, installs the hook and closes the temporary main-process debugger.
You can also double-click `reapply.command`.

The hook survives conversation switches and page reloads. **Reapply after a full
Claude restart or update**, or after editing replacers. Reapplying replaces the
previous installation. No background shell process needs to stay running.

## Configure AI narration

Table narration is opt-in. Code-block narration requires an additional opt-in.
Without a configured provider, both retain their original speech input and the
separator replacer still runs.

```sh
cp .env.example .env
chmod 600 .env
```

Set these in `.env`:

```dotenv
SPEECH_AI_ENABLED=true
SPEECH_AI_BASE_URL=https://api.openai.com/v1
SPEECH_AI_API_KEY=your-key
SPEECH_AI_MODEL=your-model
# Optional: handle fenced/indented contents for speech.
SPEECH_AI_CODE_ENABLED=true
# Optional: classify blocks with Jev so actual code/data can be narrated.
SPEECH_CLASSIFIER_ENABLED=true
TYPESAFE_API_KEY=your-jev-key
TYPESAFE_MODEL=jev-latest
```

The included provider uses Effect's OpenAI-compatible **chat completions**
integration. Set the base URL and model to those supported by your provider.
Do not assume a proprietary structured-decision API supports chat completions.
Bun loads `.env` when the CLI starts. The file is ignored by Git. Keys remain in
the CLI/main process and are never injected into the renderer or status output.

Preview with a synthetic example before applying:

```sh
bun run preview examples/table.md
bun run preview examples/code.md
bun run apply
```

Only recognized table source is sent for table narration. With both AI settings
and `SPEECH_CLASSIFIER_ENABLED=true`, recognized fenced/indented blocks are sent
to Jev (TypeSafe) in one classification request. This includes prose, comments,
string literals and fence labels. Only blocks selected for explanation are sent
to the configured narration provider. These table/block requests do not include the surrounding
response or chat history. Optional hash classification has its own context scope below. `SPEECH_AI_ENABLED=false` disables both AI rules.

Jev answers a Choice question about content type and a Noul question about
whether the block is natural-language prose. The rule requests a summary only
when the combined code/data probability is at least 0.8 and the prose probability
is at most 0.2. These are conservative routing thresholds, not measured accuracy.
Language labels such as `rust` are hints, never proof that a block contains code.
Prose, mixed or uncertain blocks retain their words with fences removed, including
nested fences. Actual code/data gets a short explanation without a “Code summary”
label. Tables exposed by unwrapping are handled by the next table rule.

**Upgrading from 2.1:** without Jev configured, enabled block handling now reads
contents directly rather than summarising every block. Classification is a
separate opt-in; a narration key does not authorize sending data to Jev.

Malformed or unavailable classification reads the contents directly. Failed,
empty, truncated or placeholder-only code narration also falls back to the
contents, so a draft does not disappear behind Claude's “code block” placeholder.
Generated narration fences are unwrapped before Claude's cleanup. Table narration
continues to preserve its original input on failure. No code is executed and the
original conversation remains unchanged. Generated explanations can be inaccurate.

For models supporting the chat-completions `reasoning_effort` parameter, optionally
set `SPEECH_AI_REASONING_EFFORT=none` (or another supported effort) to reduce latency.
Omit it for providers that do not support it. No reasoning option is sent by default.
Large or multiple blocks can still exceed the deadlines described below.

`TableNarrator.layer` and `CodeNarrator.layer` depend on Effect's `LanguageModel`,
so an Anthropic, OpenAI, local-model or other Effect provider Layer can replace
the supplied configuration in `src/ai/Provider.ts` without changing the replacers
or engine. Each narrator owns its instructions; shared completion validation
lives in `src/ai/Narration.ts`.

## Hashes

To shorten spoken commit and migration hashes, set `SPEECH_AI_HASH_ENABLED=true`
alongside `SPEECH_AI_ENABLED=true` and `SPEECH_CLASSIFIER_ENABLED=true`. It uses
`TYPESAFE_API_KEY` and `TYPESAFE_MODEL`; code-block narration need not be enabled.
Reapply after changing configuration.

The independent `hashes` replacer finds standalone hexadecimal candidates of
7–64 characters in visible paragraph/heading text, including inline code and link
labels. It sends at most 32 candidates per speech request to Jev, each with up to
160 characters before and after the candidate from the same paragraph/heading.
Link destinations, visible URLs and still-fenced code are excluded. Remaining
candidates beyond the limit are unchanged.

A Noul question asks whether the context establishes a commit hash, migration
revision or checksum. A probability of at least 0.9 replaces only that occurrence
with “hash ending ” and its final four characters. This is a conservative threshold,
not measured accuracy. Invoice numbers, colours and other ambiguous values should
remain unchanged; classification can still be wrong. The same token can receive
different decisions in different contexts. Four-character suffixes can collide.

Missing, uncertain or malformed answers, errors, and the 1.5-second hash deadline
preserve original tokens. This setting is a separate opt-in because it sends nearby
visible prose to Jev, unlike block/table-only narration. The global AI switch disables
it. Original conversation text and links are never rewritten.

```sh
bun run preview examples/hashes.md
```

## Paths and quotes

`filePaths` replaces slashes, underscores and hyphens in inline file paths with
a filename extension or an explicit directory prefix/suffix (`./`, `../`, `~/`,
`/`, or a trailing `/`). Ambiguous inline tokens such as `x/y` remain intact. For
paths without backticks, it requires a slash and filename extension, such as
`research/pedro-review.md`. Bare domains, URLs, ratios and units are left alone.
This is a conservative text heuristic, not a filesystem lookup.

`blockquotes` removes only prefixes recognised by the Markdown parser: a quoted
`> What about…` reads as “What about…”. Inline comparisons such as `count > 5`,
escaped markers and code contents remain intact. A leading, unescaped `>` is
Markdown quote syntax; use inline code or escape it when you mean a literal
operator at the start of a line. Both rules run locally without model calls.

## Add a replacer

The interface follows [URL Migrations](https://github.com/gruckion/url-migrations):
an ordered list of small rules, optional matching, and an immutable result.

Create a file such as `src/replacers/pullRequests.ts`:

```ts
import { Effect } from "effect";
import { defineReplacer } from "../index.ts";

export const pullRequests = defineReplacer({
  id: "pull-requests",
  description: "Expand PR numbers for speech",
  matches: (text) => /\bPR #\d+\b/.test(text),
  replace: (text) =>
    Effect.succeed(text.replace(/\bPR #(\d+)\b/g, "pull request $1")),
});
```

Register it in **`speech.config.ts`**:

```ts
import {
  markdownTables,
  codeBlocks,
  separators,
  filePaths,
  blockquotes,
  hashes,
} from "./src/replacers/index.ts";
import type {
  Replacer,
  NarrationFailed,
  TableNarrator,
  CodeNarrator,
  BlockClassifier,
  HashClassifier,
} from "./src/index.ts";
import { pullRequests } from "./src/replacers/pullRequests.ts";

export const replacers: ReadonlyArray<
  Replacer<
    NarrationFailed,
    TableNarrator | CodeNarrator | BlockClassifier | HashClassifier
  >
> = [
  codeBlocks,
  markdownTables,
  hashes,
  filePaths,
  separators,
  blockquotes,
  pullRequests,
];
```

Run `bun run check`, then reapply. **No engine or Claude adapter edits needed.**
[`examples/custom-replacer.ts`](examples/custom-replacer.ts) is a runnable version.

Rules receive the preceding rule's output. Unwrap blocks before parsing tables,
then clean inline references. IDs must be unique. A matcher is optional; `replace` returns an
Effect, so synchronous replacements and asynchronous service calls share one
interface. TypeScript preserves service requirements and error types.

For an asynchronous rule, use `Effect.fn` and `yield*` a service. Provide its Layer
in `cleanerLayer` in **`speech.config.ts`**, alongside the existing narrator
Layer. Extend the registry's service/error union for new services and errors.
TypeScript checks that every registered rule's services are supplied.
The engine and Claude adapter need no edits for new rules or services.

You can also use the pipeline independently of Claude:

```ts
import { Effect } from "effect";
import { createSpeechCleaner } from "./src/index.ts";
import { separators } from "./src/replacers/index.ts";

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const clean = yield* createSpeechCleaner([separators]);
    return yield* clean("`my_project/release-notes.md`");
  }),
);
// { text: "`my project/release notes.md`", applied: true,
//   changes: ["separators"], skipped: [] }
```

## Check or turn off

Enable **Developer → Enable Main Process Debugger** before each command:

```sh
bun run status
bun run remove
```

If Claude cannot be reached, the command prints the menu steps and the exact
command to retry, without a stack trace. No patch changes are made when the
initial connection fails. Enable the debugger again for each command; it closes
automatically afterwards. Connection errors still return a nonzero exit status.

`pages[].active` verifies installation. `changed` counts transformed speech
requests, and `skipped` counts failed/disabled replacers. No message text is
logged. Removal detaches listeners, cancels pending work and restores the
original speech methods. Quitting Claude also removes the runtime modification.
If another tool replaced those methods, removal reports failure; restart Claude
rather than overwriting the other tool's changes.

## What gets read aloud

In Claude Code sessions, Read aloud starts with the answer after the last activity
(tool/progress) group. It skips progress even if you expand that group. Selection
verifies the progress prefix against the clicked message's transcript items
and removes only that exact prefix from the original speech input, so tables and code still reach their replacers intact.
If Claude changes its private UI or the answer cannot be identified reliably,
the patch keeps Claude's original speech input. Regular chats are unchanged.

## Architecture

| Location           | Responsibility                                                  |
| ------------------ | --------------------------------------------------------------- |
| `speech.config.ts` | Ordered replacer registration                                   |
| `src/engine/`      | Interface, registry validation, execution, timeout and fallback |
| `src/replacers/`   | Individual text transformations                                 |
| `src/ai/`          | Narration services and shared provider composition              |
| `src/claude/`      | Claude module discovery, renderer hook and Electron lifecycle   |
| `src/cli/`         | Effect CLI, verified inspector connection and commands          |

The old WebSocket interception was too late: Claude had already removed table
pipes and separator rows. The new adapter transforms the complete Markdown input
to the Read aloud engine **before** Claude cleans/chunks it. A scoped Electron bridge drains a bounded renderer mailbox every 200 ms and runs
transformations in the main process; the renderer receives only transformed text.
API keys remain in the main process. Stop and later requests cancel pending work
so delayed responses cannot restart speech.

The temporary main-process inspector closes after each command. The speech bridge does not attach a renderer
debugger or open a network port. Each document has its own mailbox identity, so
late replies cannot cross navigation or reinstallation.

Block handling bounds classification at 1.5 seconds and the combined classification
and narration work at 3.5 seconds, with at most two narration requests running concurrently.
A narration deadline reads all original block contents; an individual failure
reads that block. These recoveries count as transformations, not skipped rules.

Unhandled replacer failures revert that rule's changes and allow later rules to run. The
default per-rule deadline is four seconds; all sequential calls within each rule
share its deadline. Large or multiple tables/code blocks may therefore fall back
to their original speech input. The live speech hook has an eight
second overall deadline, after which it speaks the original text. Hash classification
adds up to 1.5 seconds; a message with slow code, table and hash processing can hit
that overall deadline even when the individual rules finish within their limits. Inputs over
100,000 characters bypass transformations. Each renderer allows four concurrent
requests. Text is held only during processing, with no persisted cache.

## Compatibility and limitations

- macOS Read aloud only, including Mac conversations with Remote Control enabled.
  The native iPhone app makes its own speech requests and is unaffected.
- Reference cleanup only runs inside Markdown inline code, such as
  `some/file-name.bob`. The whole span must look like a filename with an extension
  or a slash-separated path, using letters, numbers, dots, underscores and hyphens
  (optionally a home-directory prefix). Within those spans, ASCII hyphens and
  underscores become spaces for speech. Plain text, fenced/indented code blocks,
  command strings and URLs are left alone. Snake_case identifiers (including an
  optional empty `()` suffix) have their underscores read as spaces. Filenames with
  spaces and Windows-style paths are not recognized yet.
- The table parser ignores fenced code. Table and code-block replacements use
  source offsets to preserve surrounding Markdown.
- Claude's speech interface and loader are private and may change. Discovery
  follows the loaded first-party module loader instead of pinning an asset hash.
  After updating Claude, verify actual Read aloud as well as installation status.
- Version 1 was audibly verified on Desktop 2.26454.0. The Effect adapter was
  installed on 2.26454.2 and sent cleaned filename text through the actual speech
  engine, receiving audio frames. This does not establish compatibility with
  future versions or narration accuracy from every provider.

## Development

```sh
bun install --frozen-lockfile
bun run check
```

Effect and its provider/platform packages are pinned to 4.0.1. Read the installed
`node_modules/effect/AGENTS.md` and `ai-docs` before changing Effect APIs; many web
examples describe Effect 3. The build produces a browser IIFE and a Node
CommonJS bundle. Electron is a type/build dependency; the installed Claude app
provides the actual Electron runtime.

Tests cover public rule composition and recovery, GFM source preservation,
the real Effect provider's HTTP contract against a local server, and speech
cancellation/restoration. They use synthetic data and no paid API calls. Live
provider configuration and audible verification are separate checks.

CI runs these checks and a dependency audit on macOS and Linux. The CLI regression
test isolates its network calls so it never connects to a running Claude app.

## Contribute and report problems

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and extension contracts.
Use [issues](https://github.com/gruckion/claude-speech-cleaner/issues) for bugs and
proposals, and [SECURITY.md](SECURITY.md) to report vulnerabilities privately.
Participation follows our [code of conduct](CODE_OF_CONDUCT.md).

See [the changelog](CHANGELOG.md), [the design plan](docs/refactor-plan.md), and
[verification notes](docs/verification.md). MIT licensed; independent of Anthropic.
