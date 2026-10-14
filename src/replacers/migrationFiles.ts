import { Effect } from "effect";
import { HashClassifier } from "../ai/HashClassifier.ts";
import { defineReplacer } from "../engine/Replacer.ts";
import { visibleCandidates } from "./visibleCandidates.ts";

// Start with standalone Unix-seconds + revision filenames, not arbitrary paths.
const filenamePattern =
  /(?<![\p{L}\p{N}_/@#.-])\d{10}_[a-f\d]{7,64}\.py(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/giu;

export const migrationFiles = defineReplacer({
  id: "migration-files",
  description:
    "Speak confirmed migration filenames using only the revision suffix",
  matches: (text) => /\d{10}_[a-f\d]{7,64}\.py/i.test(text),
  replace: Effect.fn("migrationFiles.replace")(function* (text: string) {
    const candidates = visibleCandidates(text, filenamePattern);
    if (!candidates.length) return text;
    const classifier = yield* HashClassifier;
    const decisions = yield* classifier
      .classify(
        candidates.map(({ value, context }) => ({
          value,
          context,
          kind: "migration-file" as const,
        })),
      )
      .pipe(
        Effect.timeout(1500),
        Effect.catch(() => Effect.succeed(candidates.map(() => false))),
      );
    let output = "";
    let cursor = 0;
    for (const [index, candidate] of candidates.entries()) {
      if (decisions[index] !== true) continue;
      const revision = candidate.value.slice(0, -".py".length);
      output +=
        text.slice(cursor, candidate.start) +
        `migration ending ${revision.slice(-4)}`;
      cursor = candidate.end;
    }
    return output + text.slice(cursor);
  }),
});
