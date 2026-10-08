import { expect, test } from "bun:test";
import { Context, Effect, Layer } from "effect";
import { createSpeechCleaner, defineReplacer } from "../src/index.ts";
import { separators } from "../src/replacers/index.ts";
import { pullRequests } from "../examples/custom-replacer.ts";
import { SpeechCleaner } from "../src/engine/SpeechCleaner.ts";

test("separator cleanup targets only inline code containing a file reference", async () => {
  const clean = await Effect.runPromise(createSpeechCleaner([separators]));
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["Open `some/file-name.bob`.", "Open `some/file name.bob`."],
    [
      "Use `my_file-name.ts` and `~/café_notes/version-2/`.",
      "Use `my file name.ts` and `~/café notes/version 2/`.",
    ],
    [
      "See **`./my_project/read-me.md`** and ``other_file.md``.",
      "See **`./my project/read me.md`** and ``other file.md``.",
    ],
    [
      "Plain my_project/release-notes.md and follow-up.",
      "Plain my_project/release-notes.md and follow-up.",
    ],
    [
      "`-12` `-£12` `-.5` `3-5` `1e-3` `some_variable` `--dry-run`",
      "`-12` `-£12` `-.5` `3-5` `1e-3` `some_variable` `--dry-run`",
    ],
    [
      "`git diff --stat file-name.ts` and `https://example.com/my_file`",
      "`git diff --stat file-name.ts` and `https://example.com/my_file`",
    ],
    [
      "```md\n`some/file-name.bob`\n```\n\n    `other_file.md`",
      "```md\n`some/file-name.bob`\n```\n\n    `other_file.md`",
    ],
    [
      "\\`some/file-name.bob\\` and `unclosed_file.md",
      "\\`some/file-name.bob\\` and `unclosed_file.md",
    ],
  ];
  for (const [input, expected] of cases) {
    const result = await Effect.runPromise(clean(input));
    expect(result.text).toBe(expected);
  }
});

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
  const input = "PR #42 in `my_project/`";
  const result = await Effect.runPromise(
    SpeechCleaner.use((cleaner) => cleaner.replace(input)).pipe(
      Effect.provide(
        SpeechCleaner.layer([pullRequests, separators, custom]).pipe(
          Layer.provide(Layer.succeed(Vocabulary, { name: " for Claude" })),
        ),
      ),
    ),
  );
  expect(result).toEqual({
    text: "pull request 42 in `my project/` for Claude",
    applied: true,
    changes: ["pull-requests", "separators", "vocabulary"],
    skipped: [],
  });
  expect(input).toBe("PR #42 in `my_project/`");
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
      return yield* clean("`my_file-name.md`");
    }),
  );
  expect(result.text).toBe("`my file name.md`");
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
