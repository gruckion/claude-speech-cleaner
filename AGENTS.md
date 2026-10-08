# Maintainer notes

- Use Bun. Keep Effect and its provider/platform packages on matching v4 versions.
- Before changing Effect code, read `node_modules/effect/AGENTS.md` and the relevant
  `ai-docs` examples. Use services/Layers and scoped Effects; bridge promises only
  at foreign APIs.
- For a new replacement, read README's **Add a replacer**, create its own module
  in `src/replacers`, and register it in `speech.config.ts`. The rule owns the
  transformation; the engine owns ordering, deadlines and fallback.
- The Claude adapter receives original speech Markdown. Changes must leave
  conversation text, files, clipboard and typing intact. Preserve Stop,
  supersession, page lifecycle and clean removal when editing this adapter.
- Run `bun run check` before committing. Keep provider tests synthetic; report
  live-provider and actual-audio verification separately.
