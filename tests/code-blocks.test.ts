import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  CodeNarrator,
  createSpeechCleaner,
  NarrationFailed,
} from "../src/index.ts";
import { codeBlocks, separators } from "../src/replacers/index.ts";

test("code narration replaces fenced, tilde and indented blocks while retaining inline code and surrounding Markdown", async () => {
  const blocks = [
    "```ts\nconst x = 1;\n```",
    "~~~sh\necho hello\n~~~",
    "    print('hello')",
  ];
  const seen: string[] = [];
  const input = `Before **bold** and \`my_file.ts\`.\n\n${blocks.join("\n\nBetween.\n\n")}\n\nAfter.`;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([codeBlocks]);
      return yield* clean(input);
    }).pipe(
      Effect.provideService(CodeNarrator, {
        narrate: (source) =>
          Effect.sync(() => {
            seen.push(source);
            return `Explanation ${seen.length}.`;
          }),
      }),
    ),
  );
  expect(seen).toEqual(blocks);
  expect(result.text).toBe(
    "Before **bold** and `my_file.ts`.\n\nCode summary: Explanation 1.\n\nBetween.\n\nCode summary: Explanation 2.\n\nBetween.\n\nCode summary: Explanation 3.\n\nAfter.",
  );
});

test("a later code narration failure restores every block and later filename cleanup still runs", async () => {
  const block = "```ts\nconst file = 'my_file.ts';\n```";
  const input = `See \`my_file.ts\`.\n\n${block}\n\n${block}`;
  let calls = 0;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([codeBlocks, separators]);
      return yield* clean(input);
    }).pipe(
      Effect.provideService(CodeNarrator, {
        narrate: () =>
          ++calls === 1
            ? Effect.succeed("First explanation.")
            : Effect.fail(new NarrationFailed({ reason: "provider" })),
      }),
    ),
  );
  expect(result.text).toBe(`See \`my file.ts\`.\n\n${block}\n\n${block}`);
  expect(result.skipped).toEqual(["code-blocks"]);
  expect(result.changes).toEqual(["separators"]);
});
