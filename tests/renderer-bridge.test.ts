import { expect, test } from "bun:test";
import { Effect, Fiber } from "effect";
import { createRendererBridge } from "../src/claude/RendererBridge.ts";
import {
  installSpeechHook,
  type SpeechEngine,
} from "../src/claude/SpeechHook.ts";

const tick = () => Effect.runPromise(Effect.sleep(5));

test("mailbox preserves Stop, supersession and document ownership through the speech hook", async () => {
  const bridge = createRendererBridge();
  const played: string[] = [];
  const done: string[] = [];
  const engine: SpeechEngine = {
    speak(_id, text) {
      played.push(text);
    },
    stop() {},
  };
  const hook = installSpeechHook(engine, bridge.replace);
  const speak = (text: string) =>
    engine.speak("message", text, (outcome) => done.push(outcome));
  const deliver = (
    id: string,
    text: string,
    instance: string = bridge.instance,
  ) =>
    bridge.deliver(instance, {
      id,
      text,
      applied: true,
      changes: ["test"],
      skipped: [],
    });
  try {
    speak("cancel before polling");
    await tick();
    engine.stop();
    await tick();
    expect(bridge.drain().requests).toEqual([]);
    speak("first");
    await tick();
    const first = bridge.drain().requests[0]!;
    speak("second");
    await tick();
    const next = bridge.drain();
    expect(next.requests.map((r) => r.kind)).toEqual(["cancel", "replace"]);
    const second = next.requests[1]!;
    deliver(first.id, "stale");
    deliver(second.id, "wrong document", "old-document");
    await tick();
    expect(played).toEqual([]);
    deliver(second.id, "cleaned answer");
    await tick();
    expect(played).toEqual(["cleaned answer"]);
    expect(done).toEqual(["stopped", "superseded"]);
    speak("removed while pending");
    await tick();
    const pending = bridge.drain().requests[0]!;
    hook.undo();
    bridge.close();
    deliver(pending.id, "late after removal");
    await tick();
    expect(played).toEqual(["cleaned answer"]);
    expect(bridge.drain().requests).toEqual([]);
    engine.speak("message", "unpatched", () => {});
    expect(played.at(-1)).toBe("unpatched");
  } finally {
    if (hook.status().active) hook.undo();
    bridge.close();
  }
});

test("mailbox bounds disconnected work and close releases waiting callers", async () => {
  const bridge = createRendererBridge();
  const fibers = Array.from({ length: 5 }, (_, i) =>
    Effect.runFork(bridge.replace(`input ${i}`)),
  );
  try {
    await tick();
    expect((await Effect.runPromise(Fiber.join(fibers[4]!))).skipped).toEqual([
      "bridge",
    ]);
    expect(bridge.drain().requests).toHaveLength(4);
    bridge.close();
    const results = await Promise.all(
      fibers.map((f) => Effect.runPromise(Fiber.join(f))),
    );
    expect(results.map((r) => r.text)).toEqual([
      "input 0",
      "input 1",
      "input 2",
      "input 3",
      "input 4",
    ]);
    expect(bridge.drain().requests).toEqual([]);
  } finally {
    bridge.close();
  }
});
