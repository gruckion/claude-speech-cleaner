import { Effect } from "effect";
import { defineReplacer } from "../engine/Replacer.ts";

/** Split word separators without discarding signs, ranges or numeric notation. */
export const separators = defineReplacer({
  id: "separators",
  description: "Read underscores and hyphens between letters as spaces",
  matches: (text) => /[-_]/.test(text),
  replace: (text) =>
    Effect.succeed(text.replace(/_+|(?<=\p{L})-(?=\p{L})/gu, " ")),
});
