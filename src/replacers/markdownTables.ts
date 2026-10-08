import { Effect } from "effect";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import type { RootContent } from "mdast";
import { TableNarrator } from "../ai/TableNarrator.ts";
import { defineReplacer } from "../engine/Replacer.ts";

export const markdownTables = defineReplacer({
  id: "markdown-tables",
  description: "Narrate GFM tables while preserving surrounding Markdown",
  matches: (text) => text.includes("|") && text.includes("-"),
  replace: Effect.fn("markdownTables.replace")(function* (text: string) {
    const tree = fromMarkdown(text, {
      extensions: [gfmTable()],
      mdastExtensions: [gfmTableFromMarkdown()],
    });
    const tables: Array<{ start: number; end: number }> = [];
    function visit(nodes: ReadonlyArray<RootContent>) {
      for (const node of nodes) {
        if (node.type === "table") {
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          if (start !== undefined && end !== undefined)
            tables.push({ start, end });
        } else if ("children" in node) visit(node.children);
      }
    }
    visit(tree.children);
    if (tables.length === 0) return text;
    const narrator = yield* TableNarrator;
    let output = "";
    let cursor = 0;
    for (const table of tables) {
      output += text.slice(cursor, table.start);
      output += yield* narrator.narrate(text.slice(table.start, table.end));
      cursor = table.end;
    }
    return output + text.slice(cursor);
  }),
});
