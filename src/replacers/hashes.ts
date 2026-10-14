import { Effect } from "effect";
import { visibleCandidates } from "./visibleCandidates.ts";
import { HashClassifier } from "../ai/HashClassifier.ts";
import { defineReplacer } from "../engine/Replacer.ts";

// Exclude parts of identifiers, filenames, URL paths, colors and signed values.
const candidatePattern =
  /(?<![\p{L}\p{N}_/@#.-])[a-f\d]{7,64}(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/giu;

export const hashes = defineReplacer({
  id: "hashes",
  description:
    "Use context to recognise hashes and speak only their last four characters",
  matches: (text) => /[a-f\d]{7,64}/i.test(text),
  replace: Effect.fn("hashes.replace")(function* (text: string) {
    const candidates = visibleCandidates(text, candidatePattern);
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
