import { Effect } from "effect";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";
import { BlockClassifier } from "../ai/BlockClassifier.ts";
import { readableBlock } from "./blockText.ts";
import { NarrationFailed } from "../ai/Narration.ts";
import { CodeNarrator } from "../ai/CodeNarrator.ts";
import { defineReplacer } from "../engine/Replacer.ts";

export const codeBlocks = defineReplacer({
  id: "code-blocks",
  description:
    "Explain code blocks for speech without reading or executing the code",
  replace: Effect.fn("codeBlocks.replace")(function* (text: string) {
    const tree = fromMarkdown(text);
    const blocks: Array<{ start: number; end: number }> = [];
    function visit(nodes: ReadonlyArray<RootContent>) {
      for (const node of nodes) {
        if (node.type === "code" && node.value.trim()) {
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          if (start !== undefined && end !== undefined)
            blocks.push({ start, end });
        } else if ("children" in node) visit(node.children);
      }
    }
    visit(tree.children);
    if (!blocks.length) return text;
    const classifier = yield* BlockClassifier;
    const narrator = yield* CodeNarrator;
    const sources = blocks.map((block) => text.slice(block.start, block.end));
    const originals = sources.map((source) => readableBlock(source));
    const replacements = yield* Effect.gen(function* () {
      const decisions = yield* classifier.classify(sources).pipe(
        Effect.timeout(1500),
        Effect.catch((error) =>
          error._tag === "NarrationFailed" && error.reason === "disabled"
            ? Effect.fail(error)
            : Effect.succeed(sources.map(() => "read" as const)),
        ),
      );
      return yield* Effect.forEach(
        sources,
        (source, index) => {
          if (decisions[index] !== "summarize")
            return Effect.succeed(originals[index]!);
          return narrator.narrate(source).pipe(
            Effect.flatMap((summary) => {
              const spoken = readableBlock(summary)
                .trim()
                .replace(/^(?:code summary|code block)\s*:?\s*/i, "")
                .trim();
              const labelOnly = /^(?:code summary|code block)$/i.test(
                spoken.replace(/[*_`#:.!-]/g, "").trim(),
              );
              return /[\p{L}\p{N}]/u.test(spoken) && !labelOnly
                ? Effect.succeed(spoken)
                : Effect.fail(new NarrationFailed({ reason: "placeholder" }));
            }),
            Effect.catch(() => Effect.succeed(originals[index]!)),
          );
        },
        { concurrency: 2 },
      );
    }).pipe(
      Effect.timeout(3500),
      Effect.catch((error) =>
        error._tag === "NarrationFailed" && error.reason === "disabled"
          ? Effect.fail(error)
          : Effect.succeed(originals),
      ),
    );
    let output = "";
    let cursor = 0;
    for (const [index, block] of blocks.entries()) {
      output += text.slice(cursor, block.start) + replacements[index];
      cursor = block.end;
    }
    return output + text.slice(cursor);
  }),
});
