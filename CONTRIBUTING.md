# Contributing

Bug reports, documentation improvements and new speech replacers are welcome.
This is an experimental macOS runtime modification. Claude's private interfaces
can change independently of this project; compatibility reports are valuable.

## Start here

1. Fork the repository and clone your fork.
2. Install Bun 1.4.2, then run `bun install --frozen-lockfile`.
3. Create a focused branch such as `fix/table-detection` or `feat/pull-requests`.
4. Make the change and run `bun run check`.
5. Open a pull request explaining the problem, behavior change and verification.

CI runs formatting, TypeScript, tests, builds and a dependency audit on macOS and
Linux. These checks need neither Claude nor an API key. Linux checks cover the
pipeline and CLI tests; the live Claude adapter remains macOS-only.

For a meaningful bug fix, include a regression that fails before the fix and
passes afterwards. Test observable behavior at its owning boundary. Avoid
snapshots of implementation details, paid API calls and private conversation data.

## Add a replacer

Follow [the README example](README.md#add-a-replacer). Put each rule in its own
module under `src/replacers/`, give it a unique ID and a short description, and
register it in `speech.config.ts`. Async rules receive dependencies through
Effect services and Layers. Supply those Layers in the same configuration file.
New rules should not require changes to the engine or Claude adapter.

Use Effect 4.0.1 and matching platform/provider versions. Read
`node_modules/effect/AGENTS.md` and the relevant `ai-docs` examples before changing
Effect APIs. Do not substitute older Effect 3 examples.

## Preserve these contracts

- Transform only the text sent to speech. Never edit chats, generated code,
  files, the clipboard or keyboard input.
- Preserve numeric meaning. State exactly which punctuation a rule changes.
- Keep provider calls opt-in and limited to the source a rule needs.
- Keep Stop, supersession, navigation, removal and timeout fallback working.
- Never print credentials or message text in diagnostics. Use synthetic examples.

For Claude adapter changes, also test installation, an actual Read aloud request,
Stop during processing, conversation switching and removal on macOS. Record the
Claude and Bun versions and distinguish automated checks from manual checks.
If you cannot run a live check, say so in the PR; do not claim compatibility.

## Reports and review

Use an issue for ordinary bugs or proposals. Include a minimal synthetic example,
expected and actual behavior, OS/Bun/Claude versions, and whether narration was
enabled. Never attach `.env`, API keys or private transcripts. Use
[the security policy](SECURITY.md) for suspected vulnerabilities.

Keep pull requests focused. Maintainers may request changes or decline features
that expand the adapter's access or make the default speech less faithful.
Participation follows the [code of conduct](CODE_OF_CONDUCT.md).

Contributions are licensed under the repository's [MIT license](LICENSE).
No contributor license agreement is required.
