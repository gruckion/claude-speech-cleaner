import { expect, test } from "bun:test";
import { Deferred, Effect } from "effect";
import {
  installSpeechHook,
  type SpeakArguments,
  type SpeechEngine,
} from "../src/claude/SpeechHook.ts";
import { createSpeechCleaner } from "../src/index.ts";
import { separators } from "../src/replacers/index.ts";

test("hook transforms only the speech argument and restores the original engine", async () => {
  const received = Effect.runSync(Deferred.make<SpeakArguments>());
  const calls: SpeakArguments[] = [];
  const engine: SpeechEngine = {
    speak(...args) {
      calls.push(args);
      Effect.runSync(Deferred.succeed(received, args));
    },
    stop() {},
  };
  const original = engine.speak;
  const clean = await Effect.runPromise(createSpeechCleaner([separators]));
  const hook = installSpeechHook(engine, clean);
  const text = "Open my_project/release-notes.md.";
  const done = () => {};
  const options = { voice: "test", conversationUuid: "keep-id" };
  engine.speak("message-id", text, done, options);
  const args = await Effect.runPromise(
    Deferred.await(received).pipe(Effect.timeout(1000)),
  );
  expect(args).toEqual([
    "message-id",
    "Open my project/release notes.md.",
    done,
    options,
  ]);
  expect(text).toBe("Open my_project/release-notes.md.");
  expect(hook.undo()).toBe(true);
  expect(engine.speak).toBe(original);
  engine.speak("message-id", text, done, options);
  expect(calls[1]?.[1]).toBe(text);
});

test("Stop and supersession cancel pending work; late replies never start speech", async () => {
  const calls: string[] = [];
  const outcomes: string[] = [];
  const cancelled: string[] = [];
  const started = new Set<string>();
  const engine: SpeechEngine = {
    speak(_id, text) {
      calls.push(text);
    },
    stop() {},
  };
  const hook = installSpeechHook(engine, (text) =>
    Effect.gen(function* () {
      started.add(text);
      yield* Effect.sleep(50);
      return {
        text: `${text} cleaned`,
        applied: true,
        changes: ["test"],
        skipped: [],
      };
    }).pipe(
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          cancelled.push(text);
        }),
      ),
    ),
  );
  engine.speak("a", "first", (outcome) => outcomes.push(outcome));
  await Effect.runPromise(Effect.sleep(5));
  engine.speak("b", "second", (outcome) => outcomes.push(outcome));
  await Effect.runPromise(Effect.sleep(5));
  engine.stop();
  await Effect.runPromise(Effect.sleep(80));
  expect([...started]).toEqual(["first", "second"]);
  expect(calls).toEqual([]);
  expect(outcomes).toEqual(["superseded", "stopped"]);
  expect(cancelled).toEqual(["first", "second"]);
  expect(hook.undo()).toBe(true);
});
