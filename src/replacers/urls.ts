import { Effect } from "effect";
import type { RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { defineReplacer } from "../engine/Replacer.ts";

const urlPattern =
  /(?<![\p{L}\p{N}_@/])(?:https?:\/\/|www\.)[^\s<>"'`\[\]{}]+/giu;

const spokenUrl = (value: string): string | undefined => {
  if (!/^(?:https?:\/\/|www\.)\S+$/i.test(value)) return;
  const address = /^www\./i.test(value) ? `https://${value}` : value;
  if (!URL.canParse(address)) return;
  const url = new URL(address);
  return url.hostname === "github.com" &&
    /^\/user-attachments\/assets\/[^/]+\/?$/.test(url.pathname)
    ? "GitHub attachment"
    : `link to ${url.hostname}`;
};

const shortenUrls = (source: string) =>
  source.replace(urlPattern, (match) => {
    let address = match.replace(/[.,;:!?]+$/, "");
    // Keep balanced parentheses inside URLs, but leave enclosing prose intact.
    while (
      address.endsWith(")") &&
      (address.match(/\)/g)?.length ?? 0) > (address.match(/\(/g)?.length ?? 0)
    )
      address = address.slice(0, -1);
    const label = spokenUrl(address);
    return label === undefined ? match : label + match.slice(address.length);
  });

export const urls = defineReplacer({
  id: "urls",
  description:
    "Read raw web URLs as short labels without their paths or hashes",
  matches: (text) => /https?:\/\/|www\./i.test(text),
  replace: (text) =>
    Effect.sync(() => {
      let output = "";
      let cursor = 0;
      function visit(nodes: ReadonlyArray<RootContent>) {
        for (const node of nodes) {
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          if (start === undefined || end === undefined) continue;
          const source = text.slice(start, end);
          let replacement: string | undefined;
          if (node.type === "link" && source.startsWith("<")) {
            replacement = spokenUrl(node.url);
          } else if (node.type === "inlineCode") {
            // A URL by itself is a reference; commands containing URLs are code.
            const label = spokenUrl(node.value);
            if (label !== undefined)
              replacement = source.replace(node.value, label);
          } else if (node.type === "text") {
            replacement = shortenUrls(source);
          } else if ("children" in node) visit(node.children);
          if (replacement !== undefined) {
            output += text.slice(cursor, start) + replacement;
            cursor = end;
          }
        }
      }
      // Link labels are visible prose. Destinations, definitions and code blocks
      // are intentionally not visited; Claude already reads named links by label.
      visit(fromMarkdown(text).children);
      return output + text.slice(cursor);
    }),
});
