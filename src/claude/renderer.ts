import { Effect, Schema } from "effect";
import { ClaudeError } from "./protocol.ts";
import { installSpeechHook, type SpeechEngine } from "./SpeechHook.ts";
import { createRendererBridge } from "./RendererBridge.ts";
import { selectFinalAnswer } from "./FinalAnswer.ts";

declare global {
  var __claudeSpeechCleaner: ReturnType<typeof install> | undefined;
  var __claudeSpeechActivate: typeof activate;
}

function install(engine: SpeechEngine) {
  const bridge = createRendererBridge();
  const hook = installSpeechHook(engine, bridge.replace, selectFinalAnswer);
  return {
    ...hook,
    instance: bridge.instance,
    drain: bridge.drain,
    deliver: bridge.deliver,
    undo: () => {
      const restored = hook.undo();
      bridge.close();
      return restored;
    },
  };
}

export const activate = (moduleUrl: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      if (location.origin !== "https://claude.ai")
        return yield* new ClaudeError({ message: "Not a Claude renderer" });
      if (globalThis.__claudeSpeechCleaner?.status().active)
        return globalThis.__claudeSpeechCleaner.status();
      const module: unknown = yield* Effect.tryPromise({
        try: () => import(/* @vite-ignore */ moduleUrl),
        catch: () =>
          new ClaudeError({ message: "Cannot import Claude speech module" }),
      });
      const shape = Schema.Struct({
        readAloudEngine: Schema.Struct({
          speak: Schema.Unknown,
          stop: Schema.Unknown,
        }),
      });
      yield* Schema.decodeUnknownEffect(shape)(module).pipe(
        Effect.mapError(
          () => new ClaudeError({ message: "Claude speech interface changed" }),
        ),
      );
      // Foreign module functions cannot be structurally decoded as an Effect Schema.
      const engine = (module as { readAloudEngine: SpeechEngine })
        .readAloudEngine;
      if (
        typeof engine.speak !== "function" ||
        typeof engine.stop !== "function"
      )
        return yield* new ClaudeError({
          message: "Claude speech interface changed",
        });
      // Imports can overlap across repeated activation; check again after awaiting.
      if (globalThis.__claudeSpeechCleaner?.status().active)
        return globalThis.__claudeSpeechCleaner.status();
      globalThis.__claudeSpeechCleaner = install(engine);
      return globalThis.__claudeSpeechCleaner.status();
    }),
  );

globalThis.__claudeSpeechActivate = activate;
