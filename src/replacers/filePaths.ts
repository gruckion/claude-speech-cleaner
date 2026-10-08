import { Effect } from "effect";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";
import { defineReplacer } from "../engine/Replacer.ts";

// Require a filename extension for unquoted paths: A/B, dates and units are
// ambiguous. A dotted first segment could be a bare domain, so leave it alone.
const isPath = (value: string, inline: boolean) =>
  /^(?:~\/)?[\p{L}\p{N}_./][\p{L}\p{N}_./-]*$/u.test(value) &&
  value.includes("/") &&
  /\p{L}/u.test(value) &&
  ((inline && /^(?:\.{1,2}\/|~\/|\/)|\/$/.test(value)) ||
    (/\.[\p{L}][\p{L}\p{N}]*$/u.test(value) &&
      !/^[^/]*\p{L}\.[\p{L}\p{N}-]+\//u.test(value)));

const speakPath = (value: string) => value.replace(/[/_-]+/g, " ").trim();

export const filePaths = defineReplacer({
  id: "file-paths",
  description:
    "Read file-path separators as spaces, including unquoted filenames",
  matches: (text) => text.includes("/"),
  replace: (text) =>
    Effect.sync(() => {
      let output = "";
      let cursor = 0;
      function visit(nodes: ReadonlyArray<RootContent>) {
        for (const node of nodes) {
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          if (start === undefined || end === undefined) continue;
          let replacement: string | undefined;
          const source = text.slice(start, end);
          if (node.type === "inlineCode" && isPath(node.value, true)) {
            replacement = source.replace(node.value, speakPath(node.value));
          } else if (node.type === "text") {
            replacement = source.replace(/[^\s()[\]{}<>"'`]+/gu, (token) => {
              const path = token.replace(/[.,;:!?]+$/, "");
              return isPath(path, false)
                ? speakPath(path) + token.slice(path.length)
                : token;
            });
          } else if ("children" in node) visit(node.children);
          if (replacement !== undefined) {
            output += text.slice(cursor, start) + replacement;
            cursor = end;
          }
        }
      }
      visit(fromMarkdown(text).children);
      return output + text.slice(cursor);
    }),
});
