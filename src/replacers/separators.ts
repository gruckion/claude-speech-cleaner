import { Effect } from "effect";
import { defineReplacer } from "../engine/Replacer.ts";

/** Literal speech-only cleanup; also affects minus signs and command flags. */
export const separators = defineReplacer({
  id: "separators",
  description: "Read ASCII hyphens and underscores as spaces",
  matches: (text) => /[-_]/.test(text),
  replace: (text) => Effect.succeed(text.replace(/[-_]+/g, " ")),
});
