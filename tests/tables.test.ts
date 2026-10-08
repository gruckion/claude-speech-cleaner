import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  createSpeechCleaner,
  TableNarrator,
  NarrationFailed,
} from "../src/index.ts";
import { markdownTables } from "../src/replacers/index.ts";

const table = "| Site | Cost |\n| --- | ---: |\n| A | -£12 |\n| B | £34 |";
test("GFM parsing rewrites real tables, preserving all surrounding text and fenced examples", async () => {
  const seen: string[] = [];
  const input = `Before my_file.\n\n${table}\n\n\`\`\`md\n${table}\n\`\`\`\n\nAfter.`;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([markdownTables]);
      return yield* clean(input);
    }).pipe(
      Effect.provide(
        Layer.succeed(TableNarrator, {
          narrate: (text) =>
            Effect.sync(() => {
              seen.push(text);
              return "Site A costs minus twelve pounds; site B costs thirty-four pounds.";
            }),
        }),
      ),
    ),
  );
  expect(seen).toEqual([table]);
  expect(result.text).toBe(
    `Before my_file.\n\nSite A costs minus twelve pounds; site B costs thirty-four pounds.\n\n\`\`\`md\n${table}\n\`\`\`\n\nAfter.`,
  );
});

test("a failed table leaves the complete input intact, including earlier tables", async () => {
  let calls = 0;
  const input = `${table}\n\nBetween.\n\n${table}`;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([markdownTables]);
      return yield* clean(input);
    }).pipe(
      Effect.provideService(TableNarrator, {
        narrate: () =>
          ++calls === 1
            ? Effect.succeed("first")
            : Effect.fail(new NarrationFailed({ reason: "provider" })),
      }),
    ),
  );
  expect(result.text).toBe(input);
  expect(result.skipped).toEqual(["markdown-tables"]);
});
