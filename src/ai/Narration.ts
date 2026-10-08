import { Effect, Schema } from "effect";
import { LanguageModel } from "effect/ai";

export class NarrationFailed extends Schema.TaggedError<NarrationFailed>()(
  "NarrationFailed",
  { reason: Schema.String },
) {}

/** Share completion/error handling; each narrator owns its instructions. */
export const makeNarrator = Effect.fnUntraced(function* (instructions: string) {
  const model = yield* LanguageModel.LanguageModel;
  return Effect.fn("Narration.generate")(function* (source: string) {
    const response = yield* model
      .generateText({
        prompt: [
          { role: "system", content: instructions },
          { role: "user", content: source },
        ],
      })
      .pipe(Effect.mapError(() => new NarrationFailed({ reason: "provider" })));
    if (response.finishReason !== "stop" || !response.text.trim())
      return yield* new NarrationFailed({ reason: "incomplete" });
    return response.text.trim();
  });
});
