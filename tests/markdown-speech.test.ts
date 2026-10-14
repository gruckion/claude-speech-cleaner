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

test("speech reads file paths as words while preserving ratios and code", async () => {
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
      "link to example.com example.com/my_file.ts /api/v1 A/B 10/2 km/h",
    ],
    [
      "```sh\ncat src/my_file.ts\n```\n\n    src/my_file.ts",
      "```sh\ncat src/my_file.ts\n```\n\n    src/my_file.ts",
    ],
    [
      "`https://example.com/my_file.ts` `cat src/my_file.ts`",
      "`link to example.com` `cat src/my_file.ts`",
    ],
  ];
  for (const [source, expected] of cases)
    expect((await clean(source)).text).toBe(expected);
});

test("speech shortens visible raw URLs and preserves meaningful link labels and code", async () => {
  const attachment =
    "https://github.com/user-attachments/assets/ffdad1a6-fb67-4bd8-a7dc-45fb013acaf0";
  const cases: ReadonlyArray<readonly [string, string]> = [
    [
      `SOL-3972 is ready. 3 min video: [${attachment}](${attachment})`,
      `SOL-3972 is ready. 3 min video: [GitHub attachment](${attachment})`,
    ],
    [`Video: ${attachment}`, "Video: GitHub attachment"],
    [`<${attachment}>`, "GitHub attachment"],
    [
      `[Watch the **demo**](${attachment})`,
      `[Watch the **demo**](${attachment})`,
    ],
    [
      "See https://example.com/private/token?key=secret#hash, then www.example.org/video.",
      "See link to example.com, then link to www.example.org.",
    ],
    ["(https://example.com/a_(b)). Next.", "(link to example.com). Next."],
    [
      "https://github.com.evil.example/user-attachments/assets/abc https://github.com/owner/repo/commit/abcdef12345",
      "link to github.com.evil.example link to github.com",
    ],
    [
      `\`${attachment}\` and \`curl ${attachment}\``,
      `\`GitHub attachment\` and \`curl ${attachment}\``,
    ],
    [
      `[${attachment}][video]\n\n[video]: ${attachment}`,
      `[GitHub attachment][video]\n\n[video]: ${attachment}`,
    ],
    [
      `\`\`\`sh\ncurl ${attachment}\n\`\`\`\n\n    ${attachment}`,
      `\`\`\`sh\ncurl ${attachment}\n\`\`\`\n\n    ${attachment}`,
    ],
    [
      "Broken https:// and email me@example.com.",
      "Broken https:// and email me@example.com.",
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
