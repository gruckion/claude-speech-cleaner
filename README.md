# Claude speech cleaner

An **Effect 4 TypeScript** pipeline for making Claude Desktop's Read aloud easier
to follow. It changes only the text passed to speech: conversation history,
generated code, files, clipboard and keyboard input stay untouched.

- Replace filename hyphens and underscores with spaces.
- Turn Markdown tables into spoken prose using an LLM.
- Add named, independently testable replacers in one registration file.

This is an unofficial macOS runtime modification, not a Claude Code plugin or an
Anthropic-supported extension. It leaves Claude's installed files unchanged.

## Install and enable

Requires macOS, Claude at `/Applications/Claude.app`, Git and [Bun](https://bun.sh).

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

## Configure table narration

Table narration is opt-in. Without a configured provider, tables retain their
original wording and the separator replacer still runs.

```sh
cp .env.example .env
```

Set these in `.env`:

```dotenv
SPEECH_AI_ENABLED=true
SPEECH_AI_BASE_URL=https://api.openai.com/v1
SPEECH_AI_API_KEY=your-key
SPEECH_AI_MODEL=your-model
```

The included provider uses Effect's OpenAI-compatible **chat completions**
integration. Set the base URL and model to those supported by your provider.
Do not assume a proprietary structured-decision API supports chat completions.
Bun loads `.env` when the CLI starts. The file is ignored by Git. Keys remain in
the CLI/main process and are never injected into the renderer or status output.

Preview with a synthetic example before applying:

```sh
bun run preview examples/table.md
bun run apply
```

Only recognized table source is sent to the model, not the surrounding response
or chat history. Each table is narrated with instructions to retain row/column
associations, values, signs, units and caveats. This is generated text: fidelity
is not guaranteed. Empty or truncated responses, provider errors and timeouts
leave that replacer's input unchanged. There is no silent change of provider.

`TableNarrator.layer` depends on Effect's `LanguageModel`, so an Anthropic,
OpenAI, local-model or other Effect provider Layer can replace the supplied
configuration in `src/ai/Provider.ts` without changing the table replacer or engine.

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
import { markdownTables, separators } from "./src/replacers/index.ts";
import { pullRequests } from "./src/replacers/pullRequests.ts";

export const replacers = [markdownTables, separators, pullRequests];
```

Run `bun run check`, then reapply. **No engine or Claude adapter edits needed.**
[`examples/custom-replacer.ts`](examples/custom-replacer.ts) is a runnable version.

Rules receive the preceding rule's output. Parse tables before stripping
punctuation. IDs must be unique. A matcher is optional; `replace` returns an
Effect, so synchronous replacements and asynchronous service calls share one
interface. TypeScript preserves service requirements and error types.

For an asynchronous rule, use `Effect.fn` and `yield*` a service. Provide its Layer
at the application composition point (`src/engine/SpeechCleaner.ts` and the host
composition), just as the table rule uses `TableNarrator`. The engine needs no
new rule types or switch cases.

You can also use the pipeline independently of Claude:

```ts
import { Effect } from "effect";
import { createSpeechCleaner } from "./src/index.ts";
import { separators } from "./src/replacers/index.ts";

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const clean = yield* createSpeechCleaner([separators]);
    return yield* clean("my_project/release-notes.md");
  }),
);
// { text: "my project/release notes.md", applied: true,
//   changes: ["separators"], skipped: [] }
```

## Check or turn off

Enable **Developer → Enable Main Process Debugger** before each command:

```sh
bun run status
bun run remove
```

`pages[].active` verifies installation. `changed` counts transformed speech
requests, and `skipped` counts failed/disabled replacers. No message text is
logged. Removal detaches listeners, cancels pending work and restores the
original speech methods. Quitting Claude also removes the runtime modification.
If another tool replaced those methods, removal reports failure; restart Claude
rather than overwriting the other tool's changes.

## Architecture

| Location           | Responsibility                                                  |
| ------------------ | --------------------------------------------------------------- |
| `speech.config.ts` | Ordered replacer registration                                   |
| `src/engine/`      | Interface, registry validation, execution, timeout and fallback |
| `src/replacers/`   | Individual text transformations                                 |
| `src/ai/`          | Table narration service and provider composition                |
| `src/claude/`      | Claude module discovery, renderer hook and Electron lifecycle   |
| `src/cli/`         | Effect CLI, verified inspector connection and commands          |

The old WebSocket interception was too late: Claude had already removed table
pipes and separator rows. The new adapter transforms the complete Markdown input
to the Read aloud engine **before** Claude cleans/chunks it. A scoped Electron
`Runtime.addBinding` bridge runs transformations in the main process; the renderer
receives only the transformed text. Stop and later requests cancel pending work
so delayed responses cannot restart speech.

The temporary main-process inspector closes after each command. A renderer
DevTools protocol attachment remains for the bridge while enabled. It creates
no listening network port. Opening renderer DevTools can detach this bridge;
close DevTools and reapply if needed.

Replacer failures revert that rule's changes and allow later rules to run. The
default per-rule deadline is four seconds; the live speech hook has an eight
second overall deadline, after which it speaks the original text. Inputs over
100,000 characters bypass transformations. Each renderer allows four concurrent
requests. Text is held only during processing, with no persisted cache.

## Compatibility and limitations

- macOS Read aloud only, including Mac conversations with Remote Control enabled.
  The native iPhone app makes its own speech requests and is unaffected.
- The separator rule is literal. It also replaces ASCII minus signs and command
  flags in speech; Unicode dashes remain. Remove or refine that rule if unwanted.
- The GFM parser ignores fenced code. Tables are replaced by source offsets so
  surrounding Markdown is preserved by the table rule.
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

See [the design plan](docs/refactor-plan.md). MIT licensed; independent of Anthropic.
