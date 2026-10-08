import { Context, Effect, Layer } from "effect";
import { replacers } from "../../speech.config.ts";
import { TableNarrator } from "../ai/TableNarrator.ts";
import { createSpeechCleaner, type ReplacementResult } from "./Replacer.ts";

export class SpeechCleaner extends Context.Service<
  SpeechCleaner,
  {
    readonly replace: (text: string) => Effect.Effect<ReplacementResult>;
  }
>()("claude-speech-cleaner/engine/SpeechCleaner") {
  static readonly layer = Layer.effect(
    SpeechCleaner,
    Effect.gen(function* () {
      const narrator = yield* TableNarrator;
      const replace = yield* createSpeechCleaner(replacers);
      return SpeechCleaner.of({
        replace: (text) =>
          replace(text).pipe(Effect.provideService(TableNarrator, narrator)),
      });
    }),
  );
}
