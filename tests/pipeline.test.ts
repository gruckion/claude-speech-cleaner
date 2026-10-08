import { expect, test } from "bun:test";
import { Context, Effect, Layer } from "effect";
import { createSpeechCleaner, defineReplacer } from "../src/index.ts";
import { separators } from "../src/replacers/index.ts";
import { pullRequests } from "../examples/custom-replacer.ts";

test("registered rules compose in order with dependencies and scoped matching", async () => {
  class Vocabulary extends Context.Service<
    Vocabulary,
    { readonly name: string }
  >()("test/Vocabulary") {}
  const custom = defineReplacer({
    id: "vocabulary",
    description: "Name the product",
    matches: (text) => text.includes("pull request"),
    replace: Effect.fn(function* (text: string) {
      return text + (yield* Vocabulary).name;
    }),
  });
  const input = "PR #42 in my_project";
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([
        pullRequests,
        separators,
        custom,
      ]);
      return yield* clean(input);
    }).pipe(Effect.provide(Layer.succeed(Vocabulary, { name: " for Claude" }))),
  );
  expect(result).toEqual({
    text: "pull request 42 in my project for Claude",
    applied: true,
    changes: ["pull-requests", "separators", "vocabulary"],
    skipped: [],
  });
  expect(input).toBe("PR #42 in my_project");
});

test("failed, throwing, and timed-out replacers preserve prior text and let later rules run", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner(
        [
          defineReplacer({
            id: "failure",
            description: "Unavailable",
            replace: () => Effect.fail("offline"),
          }),
          defineReplacer({
            id: "defect",
            description: "Broken matcher",
            matches: () => {
              throw new Error("oops");
            },
            replace: () => Effect.succeed("lost"),
          }),
          defineReplacer({
            id: "slow",
            description: "Never completes",
            replace: () => Effect.never,
          }),
          separators,
        ],
        { timeoutMs: 10 },
      );
      return yield* clean("my_file-name");
    }),
  );
  expect(result.text).toBe("my file name");
  expect(result.skipped).toEqual(["failure", "defect", "slow"]);
  expect(result.changes).toEqual(["separators"]);
});

test("registry rejects duplicate IDs and unchanged input reports no changes", async () => {
  const invalid = await Effect.runPromise(
    createSpeechCleaner([separators, separators]).pipe(Effect.flip),
  );
  expect(invalid._tag).toBe("InvalidRegistry");
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([separators]);
      return yield* clean("Hello there.");
    }),
  );
  expect(result).toEqual({
    text: "Hello there.",
    applied: false,
    changes: [],
    skipped: [],
  });
});
