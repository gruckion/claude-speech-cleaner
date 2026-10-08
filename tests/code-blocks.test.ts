import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  CodeNarrator,
  BlockClassifier,
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
      Effect.provideService(BlockClassifier, {
        classify: (blocks) =>
          Effect.succeed(blocks.map(() => "summarize" as const)),
      }),
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
    "Before **bold** and `my_file.ts`.\n\nExplanation 1.\n\nBetween.\n\nExplanation 2.\n\nBetween.\n\nExplanation 3.\n\nAfter.",
  );
});

test("a later narration failure reads that block and retains earlier summaries and inline cleanup", async () => {
  const block = "```ts\nconst file = 'my_file.ts';\n```";
  const input = `See \`my_file.ts\`.\n\n${block}\n\n${block}`;
  let calls = 0;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([codeBlocks, separators]);
      return yield* clean(input);
    }).pipe(
      Effect.provideService(BlockClassifier, {
        classify: (blocks) =>
          Effect.succeed(blocks.map(() => "summarize" as const)),
      }),
      Effect.provideService(CodeNarrator, {
        narrate: () =>
          ++calls === 1
            ? Effect.succeed("First explanation.")
            : Effect.fail(new NarrationFailed({ reason: "provider" })),
      }),
    ),
  );
  expect(result.text).toBe(
    "See `my file.ts`.\n\nFirst explanation.\n\nconst file = 'my_file.ts';",
  );
  expect(result.skipped).toEqual([]);
  expect(result.changes).toEqual(["code-blocks", "separators"]);
});

test("fenced prose remains audible when narration returns only a placeholder", async () => {
  const input =
    "Before.\n\n```rust\nProposed:\n- Give reviewers read-only access.\n- Run the app to reproduce the issue.\n```\n\nAfter.";
  const clean = await Effect.runPromise(createSpeechCleaner([codeBlocks]));
  for (const placeholder of [
    "Code summary",
    "```text\n**Code summary**\n```",
    "(code block)",
    "(Code summary)",
  ]) {
    const result = await Effect.runPromise(
      clean(input).pipe(
        Effect.provideService(BlockClassifier, {
          classify: () => Effect.succeed(["summarize"]),
        }),
        Effect.provideService(CodeNarrator, {
          narrate: () => Effect.succeed(placeholder),
        }),
      ),
    );
    expect(result.text).toBe(
      "Before.\n\nProposed:\n- Give reviewers read-only access.\n- Run the app to reproduce the issue.\n\nAfter.",
    );
  }
});

test("prose is unwrapped recursively without a narrator call, even with misleading fence labels", async () => {
  const input =
    "Before.\n\n````rust\nHere is the draft:\n\n```\nCall `enqueue_route_optimizations_after_commit`.\n```\n````\n\nAfter.";
  const clean = await Effect.runPromise(
    createSpeechCleaner([codeBlocks, separators]),
  );
  const result = await Effect.runPromise(
    clean(input).pipe(
      Effect.provide(BlockClassifier.verbatim),
      Effect.provideService(CodeNarrator, {
        narrate: () => Effect.die("Prose must not be summarized"),
      }),
    ),
  );
  expect(result.text).toBe(
    "Before.\n\nHere is the draft:\n\nCall `enqueue route optimizations after commit`.\n\nAfter.",
  );
});

test("classifier and narrator deadlines preserve audible contents", async () => {
  const input = "```ts\nconst value = 1;\n```";
  const clean = await Effect.runPromise(createSpeechCleaner([codeBlocks]));
  for (const classify of [
    () => Effect.never,
    () => Effect.succeed(["summarize" as const]),
  ]) {
    const result = await Effect.runPromise(
      clean(input).pipe(
        Effect.provideService(BlockClassifier, { classify }),
        Effect.provideService(CodeNarrator, { narrate: () => Effect.never }),
      ),
    );
    expect(result.text).toBe("const value = 1;");
  }
}, 10000);
