import { Effect, Schema } from "effect";
import { ClaudeError, Reply } from "./protocol.ts";
import { installSpeechHook, type SpeechEngine } from "./SpeechHook.ts";
import type { ReplacementResult } from "../engine/Replacer.ts";

declare global {
  var __claudeSpeechCleanerRequest: (payload: string) => void;
  var __claudeSpeechCleaner: ReturnType<typeof install> | undefined;
  var __claudeSpeechActivate: typeof activate;
}

function install(engine: SpeechEngine) {
  const waiting = new Map<
    string,
    (effect: Effect.Effect<ReplacementResult, ClaudeError>) => void
  >();
  const prefix = crypto.randomUUID();
  let sequence = 0;
  const hook = installSpeechHook(engine, (text) =>
    Effect.callback<ReplacementResult, ClaudeError>((resume) => {
      const id = `${prefix}:${++sequence}`;
      waiting.set(id, resume);
      try {
        globalThis.__claudeSpeechCleanerRequest(
          JSON.stringify({ kind: "replace", id, text }),
        );
      } catch {
        resume(
          Effect.fail(
            new ClaudeError({ message: "Speech bridge unavailable" }),
          ),
        );
      }
      return Effect.sync(() => {
        if (waiting.delete(id)) {
          try {
            globalThis.__claudeSpeechCleanerRequest(
              JSON.stringify({ kind: "cancel", id }),
            );
          } catch {
            /* Host removed. */
          }
        }
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          text,
          applied: false,
          changes: [],
          skipped: ["bridge"],
        }),
      ),
    ),
  );
  return {
    ...hook,
    deliver: (input: unknown) => {
      const result = Schema.decodeUnknownOption(Reply)(input);
      if (result._tag === "None") return;
      const reply = result.value;
      const resume = waiting.get(reply.id);
      waiting.delete(reply.id);
      resume?.(Effect.succeed(reply));
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
      globalThis.__claudeSpeechCleaner = install(engine);
      return globalThis.__claudeSpeechCleaner.status();
    }),
  );

globalThis.__claudeSpeechActivate = activate;
