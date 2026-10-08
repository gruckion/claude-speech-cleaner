import { Effect } from "effect";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";
import { defineReplacer } from "../engine/Replacer.ts";

// A conservative filename/path heuristic, not a filesystem lookup. Reject
// command strings, URLs, flags and bare variables even when they use backticks.
const isFileReference = (value: string) =>
  /^(?:~\/)?[\p{L}\p{N}_./][\p{L}\p{N}_./-]*$/u.test(value) &&
  /\p{L}/u.test(value) &&
  (value.includes("/") || /\.[\p{L}][\p{L}\p{N}]*$/u.test(value));

/** Only rewrite source spans that Markdown recognizes as inline file references. */
export const separators = defineReplacer({
  id: "separators",
  description:
    "Read separators in backtick-wrapped filenames and paths as spaces",
  matches: (text) => text.includes("`") && /[-_]/.test(text),
  replace: (text) =>
    Effect.sync(() => {
      const tree = fromMarkdown(text);
      let output = "";
      let cursor = 0;
      function visit(nodes: ReadonlyArray<RootContent>) {
        for (const node of nodes) {
          if (node.type === "inlineCode" && isFileReference(node.value)) {
            const start = node.position?.start.offset;
            const end = node.position?.end.offset;
            if (start === undefined || end === undefined) continue;
            output += text.slice(cursor, start);
            output += text.slice(start, end).replace(/[-_]+/g, " ");
            cursor = end;
          } else if ("children" in node) visit(node.children);
        }
      }
      visit(tree.children);
      return output + text.slice(cursor);
    }),
});
