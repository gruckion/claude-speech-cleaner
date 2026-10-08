import { expect, test } from "bun:test";
import { Effect } from "effect";
import { cleanerLayer } from "../speech.config.ts";
import { SpeechCleaner } from "../src/engine/SpeechCleaner.ts";

const clean = (text: string) =>
  Effect.runPromise(
    SpeechCleaner.use((cleaner) => cleaner.replace(text)).pipe(
      Effect.provide(
        cleanerLayer({
          enabled: false,
          codeEnabled: false,
          apiKey: "",
          apiUrl: "",
          model: "",
        }),
      ),
    ),
  );

test("speech reads file paths as words without altering URLs, ratios or code", async () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["`km/h` `x/y` `A/B`", "`km/h` `x/y` `A/B`"],
    [
      "`./src/components` `src/components/`",
      "`. src components` `src components`",
    ],
    [
      "**Draft replies to Pedro** (not posted; full text in sol-4174-research/pedro-review-replies-draft.md)",
      "**Draft replies to Pedro** (not posted; full text in sol 4174 research pedro review replies draft.md)",
    ],
    [
      "Open `some/file-name.bob` and `src/main.ts`.",
      "Open `some file name.bob` and `src main.ts`.",
    ],
    [
      "See **src/my_file.ts**, ../docs/read-me.md; then ~/notes/draft.md.",
      "See **src my file.ts**, .. docs read me.md; then ~ notes draft.md.",
    ],
    [
      "[src/my_file.ts](https://example.com/src/my_file.ts)",
      "[src my file.ts](https://example.com/src/my_file.ts)",
    ],
    [
      "https://example.com/my_file.ts example.com/my_file.ts /api/v1 A/B 10/2 km/h",
      "https://example.com/my_file.ts example.com/my_file.ts /api/v1 A/B 10/2 km/h",
    ],
    [
      "```sh\ncat src/my_file.ts\n```\n\n    src/my_file.ts",
      "```sh\ncat src/my_file.ts\n```\n\n    src/my_file.ts",
    ],
    [
      "`https://example.com/my_file.ts` `cat src/my_file.ts`",
      "`https://example.com/my_file.ts` `cat src/my_file.ts`",
    ],
  ];
  for (const [source, expected] of cases)
    expect((await clean(source)).text).toBe(expected);
});

test("speech removes parsed blockquote markers while retaining comparison operators", async () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    [
      "> What about a visit that grows into the next stop?",
      "What about a visit that grows into the next stop?",
    ],
    [
      "> Call `enqueue_route_optimizations_after_commit`; count > 5.\n> Then review.",
      "Call `enqueue route optimizations after commit`; count > 5.\nThen review.",
    ],
    ["> Outer\n>> Inner\n>\n> End", "Outer\nInner\n\nEnd"],
    ["- > Quoted\n  > reply", "- Quoted\n  reply"],
    [
      "> First\nlazy continuation\n\nAfter",
      "First\nlazy continuation\n\nAfter",
    ],
    [
      "Compare count > 5, `x >= 3`, and `items >> 1`.",
      "Compare count > 5, `x >= 3`, and `items >> 1`.",
    ],
    [
      "\\> literal\n\n```txt\n> literal\n```\n\n    > literal",
      "\\> literal\n\n```txt\n> literal\n```\n\n    > literal",
    ],
    ["> ```txt\n> x > 5\n> ```", "```txt\nx > 5\n```"],
  ];
  for (const [source, expected] of cases)
    expect((await clean(source)).text).toBe(expected);
});
