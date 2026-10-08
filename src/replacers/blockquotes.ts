import { Effect } from "effect";
import { fromMarkdown } from "mdast-util-from-markdown";
import { defineReplacer } from "../engine/Replacer.ts";

export const blockquotes = defineReplacer({
  id: "blockquotes",
  description: "Read quoted Markdown without speaking its quote markers",
  matches: (text) => text.includes(">"),
  replace: (text) =>
    Effect.sync(() => {
      const prefixes: Array<{ readonly start: number; readonly end: number }> =
        [];
      // Use actual Markdown tokens, not every greater-than character. This also
      // handles nested/list quotes without touching operators or fenced contents.
      fromMarkdown(text, {
        mdastExtensions: [
          {
            enter: {
              blockQuotePrefix(token) {
                prefixes.push({
                  start: token.start.offset,
                  end: token.end.offset,
                });
              },
            },
          },
        ],
      });
      let output = text;
      for (const prefix of prefixes.sort((a, b) => b.start - a.start)) {
        output = output.slice(0, prefix.start) + output.slice(prefix.end);
      }
      return output;
    }),
});
