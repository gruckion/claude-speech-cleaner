import { Effect, Option } from "effect";
import { HttpClient } from "effect/http";
import { ClaudeError } from "./protocol.ts";

const assetRoot = "https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/";
const trusted = (url: string) =>
  url.startsWith(assetRoot) && url.endsWith(".js");

/** Follow the symbolic loader, never a pinned content hash. Only read first-party assets. */
export const discoverSpeechModule = Effect.fn("Claude.discoverSpeechModule")(
  function* (resources: ReadonlyArray<string>) {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
    );
    const urls = [...new Set(resources)].filter(trusted);
    // Shared loader chunks are much cheaper to inspect than importing every module.
    const candidates = urls.filter((url) => /\/shared-\d+-/.test(url));
    for (const url of candidates) {
      const source = yield* client.get(url).pipe(
        Effect.flatMap((response) => response.text),
        Effect.timeout(3000),
        Effect.option,
      );
      if (Option.isNone(source)) continue;
      const match =
        /\bid:["']read_aloud_engine["'][\s\S]{0,1200}?\bimport\(["']([^"']+)["']\)/.exec(
          source.value,
        );
      if (match?.[1]) {
        const found = new URL(match[1], url).href;
        if (trusted(found)) return found;
      }
    }
    return yield* new ClaudeError({
      message:
        "Could not locate Claude's Read aloud loader. Open a conversation and retry; a Claude update may require an adapter update.",
    });
  },
);
