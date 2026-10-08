import { Effect } from "effect";
import { defineReplacer } from "../src/index.ts";

export const pullRequests = defineReplacer({
  id: "pull-requests",
  description: "Expand PR numbers for speech",
  matches: (text) => /\bPR #\d+\b/.test(text),
  replace: (text) =>
    Effect.succeed(text.replace(/\bPR #(\d+)\b/g, "pull request $1")),
});
