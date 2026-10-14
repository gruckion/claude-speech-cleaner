import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";

const maskUrls = (text: string) =>
  text.replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)\S+/gi, (url) =>
    " ".repeat(url.length),
  );

/** Bounded candidates from visible prose only; preserve source offsets. */
export function visibleCandidates(text: string, pattern: RegExp) {
  const candidates: Array<{
    start: number;
    end: number;
    value: string;
    context: string;
  }> = [];
  function visit(nodes: ReadonlyArray<RootContent>) {
    for (const node of nodes) {
      if (candidates.length >= 32) return;
      if (node.type === "paragraph" || node.type === "heading") {
        let visible = "";
        const pending: Array<{
          start: number;
          end: number;
          value: string;
          offset: number;
        }> = [];
        function collect(children: ReadonlyArray<RootContent>) {
          for (const child of children) {
            if (child.type === "text" || child.type === "inlineCode") {
              const start = child.position?.start.offset;
              const end = child.position?.end.offset;
              if (start === undefined || end === undefined) continue;
              // Mask visible URLs before matching. Link destinations never enter
              // this traversal; the classifier sees only rendered label text.
              const source = maskUrls(text.slice(start, end));
              for (const match of source.matchAll(pattern)) {
                if (candidates.length + pending.length >= 32) break;
                pending.push({
                  start: start + match.index,
                  end: start + match.index + match[0].length,
                  value: match[0],
                  offset: visible.length + match.index,
                });
              }
              visible += source + " ";
            } else if ("children" in child) collect(child.children);
          }
        }
        collect(node.children);
        for (const item of pending) {
          candidates.push({
            start: item.start,
            end: item.end,
            value: item.value,
            context: visible
              .slice(
                Math.max(0, item.offset - 160),
                item.offset + item.value.length + 160,
              )
              .replace(/\s+/g, " ")
              .trim(),
          });
        }
      } else if ("children" in node) visit(node.children);
    }
  }
  visit(fromMarkdown(text).children);
  return candidates;
}
