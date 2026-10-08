import { Effect, Fiber } from "effect";
import type { ReplacementResult } from "../engine/Replacer.ts";

export type SpeakArguments = [
  messageId: string,
  text: string,
  onDone: (
    outcome: string,
    duration: number,
    details: Record<string, unknown>,
  ) => void,
  options?: Record<string, unknown>,
];
export interface SpeechEngine {
  speak(...args: SpeakArguments): void;
  stop(): void;
}

/** Only this adapter knows Claude's synchronous engine interface. */
export function installSpeechHook(
  engine: SpeechEngine,
  replace: (text: string) => Effect.Effect<ReplacementResult>,
) {
  const originalSpeak = engine.speak;
  const originalStop = engine.stop;
  let pending:
    { fiber: Fiber.Fiber<void>; done: SpeakArguments[2] } | undefined;
  let generation = 0;
  let changed = 0;
  let skipped = 0;
  let enabled = true;
  const cancel = (reason: string) => {
    generation++;
    const previous = pending;
    pending = undefined;
    if (previous) {
      Effect.runFork(Fiber.interrupt(previous.fiber));
      previous.done(reason, 0, {});
    }
  };
  const speak: SpeechEngine["speak"] = function (...args) {
    cancel("superseded");
    originalStop.call(engine);
    const current = generation;
    // Run asynchronously so the pending handle exists even for a synchronous rule.
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        yield* Effect.yieldNow;
        const result = yield* (
          args[1].length > 100_000
            ? Effect.succeed({
                text: args[1],
                applied: false,
                changes: [],
                skipped: ["size-limit"],
              })
            : replace(args[1])
        ).pipe(
          Effect.timeout(8000),
          Effect.catchCause(() =>
            Effect.succeed({
              text: args[1],
              applied: false,
              changes: [],
              skipped: ["pipeline"],
            }),
          ),
        );
        if (!enabled || generation !== current) return;
        pending = undefined;
        if (result.applied) changed++;
        skipped += result.skipped.length;
        originalSpeak.call(engine, args[0], result.text, args[2], args[3]);
      }),
    );
    pending = { fiber, done: args[2] };
  };
  const stop = () => {
    cancel("stopped");
    originalStop.call(engine);
  };
  engine.speak = speak;
  engine.stop = stop;
  return {
    status: () => ({
      active: enabled && engine.speak === speak && engine.stop === stop,
      changed,
      skipped,
      pending: pending !== undefined,
    }),
    undo: () => {
      enabled = false;
      cancel("stopped");
      if (engine.speak !== speak || engine.stop !== stop) return false;
      engine.speak = originalSpeak;
      engine.stop = originalStop;
      return true;
    },
  };
}
