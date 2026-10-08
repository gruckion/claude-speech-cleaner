import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";

/** Unwrap containers so Claude's next cleanup cannot discard their contents. */
export function readableBlock(text: string, depth = 0): string {
  if (depth >= 8) return text.replace(/`{3,}|~{3,}/g, "");
  let output = "";
  let cursor = 0;
  function visit(nodes: ReadonlyArray<RootContent>) {
    for (const node of nodes) {
      if (node.type === "code") {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start === undefined || end === undefined) continue;
        output +=
          text.slice(cursor, start) + readableBlock(node.value, depth + 1);
        cursor = end;
      } else if ("children" in node) visit(node.children);
    }
  }
  visit(fromMarkdown(text).children);
  return (output + text.slice(cursor)).replace(/`{3,}/g, "");
}
