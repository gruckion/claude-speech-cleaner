import { Context, Effect, Layer } from "effect";
import {
  createSpeechCleaner,
  type Replacer,
  type ReplacementResult,
} from "./Replacer.ts";

export class SpeechCleaner extends Context.Service<
  SpeechCleaner,
  {
    readonly replace: (text: string) => Effect.Effect<ReplacementResult>;
  }
>()("claude-speech-cleaner/engine/SpeechCleaner") {
  static readonly layer = <E, R>(replacers: ReadonlyArray<Replacer<E, R>>) =>
    Layer.effect(
      SpeechCleaner,
      Effect.gen(function* () {
        const services = yield* Effect.context<R>();
        const replace = yield* createSpeechCleaner(replacers);
        return SpeechCleaner.of({
          replace: (text) => replace(text).pipe(Effect.provide(services)),
        });
      }),
    );
}
