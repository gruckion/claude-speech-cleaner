import { Effect } from "effect";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";
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
    const narrator = yield* CodeNarrator;
    let output = "";
    let cursor = 0;
    for (const block of blocks) {
      output += text.slice(cursor, block.start);
      output +=
        "Code summary: " +
        (yield* narrator.narrate(text.slice(block.start, block.end)));
      cursor = block.end;
    }
    return output + text.slice(cursor);
  }),
});
