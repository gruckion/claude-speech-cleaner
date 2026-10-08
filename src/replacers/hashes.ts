import { Effect } from "effect";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";
import { HashClassifier } from "../ai/HashClassifier.ts";
import { defineReplacer } from "../engine/Replacer.ts";

// Exclude parts of identifiers, filenames, URL paths, colors and signed values.
const candidatePattern =
  /(?<![\p{L}\p{N}_/@#.-])[a-f\d]{7,64}(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/giu;
const maskUrls = (text: string) =>
  text.replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)\S+/gi, (url) =>
    " ".repeat(url.length),
  );

export const hashes = defineReplacer({
  id: "hashes",
  description:
    "Use context to recognise hashes and speak only their last four characters",
  matches: (text) => /[a-f\d]{7,64}/i.test(text),
  replace: Effect.fn("hashes.replace")(function* (text: string) {
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
                for (const match of source.matchAll(candidatePattern)) {
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
    if (!candidates.length) return text;
    const classifier = yield* HashClassifier;
    const decisions = yield* classifier
      .classify(candidates.map(({ value, context }) => ({ value, context })))
      .pipe(
        Effect.timeout(1500),
        Effect.catch(() => Effect.succeed(candidates.map(() => false))),
      );
    let output = "";
    let cursor = 0;
    for (const [index, candidate] of candidates.entries()) {
      if (decisions[index] !== true) continue;
      output +=
        text.slice(cursor, candidate.start) +
        `hash ending ${candidate.value.slice(-4)}`;
      cursor = candidate.end;
    }
    return output + text.slice(cursor);
  }),
});
