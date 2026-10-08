import { Effect, Schema } from "effect";
import type { ReplacementResult } from "../engine/Replacer.ts";
import { ClaudeError, Reply, type Request } from "./protocol.ts";

/** Per-document mailbox. Only Electron's main process drains it; no debugger. */
export function createRendererBridge() {
  const instance = crypto.randomUUID();
  const waiting = new Map<
    string,
    (value: Effect.Effect<ReplacementResult, ClaudeError>) => void
  >();
  const queued = new Map<string, Request>();
  let sequence = 0;
  let closed = false;
  const replace = (text: string) =>
    Effect.callback<ReplacementResult, ClaudeError>((resume) => {
      if (closed || waiting.size >= 4 || queued.size >= 16) {
        resume(
          Effect.fail(
            new ClaudeError({ message: "Speech bridge unavailable" }),
          ),
        );
        return;
      }
      const id = `${instance}:${++sequence}`;
      waiting.set(id, resume);
      queued.set(id, { kind: "replace", id, text });
      return Effect.sync(() => {
        if (!waiting.delete(id)) return;
        // A request still in the mailbox has never reached the host.
        if (!queued.delete(id) && !closed)
          queued.set(id, { kind: "cancel", id });
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
    );
  return {
    instance,
    replace,
    drain: () => {
      const requests = [...queued.values()];
      queued.clear();
      return { instance, requests };
    },
    deliver: (target: string, input: unknown) => {
      if (closed || target !== instance) return;
      const parsed = Schema.decodeUnknownOption(Reply)(input);
      if (parsed._tag === "None") return;
      const reply = parsed.value;
      const resume = waiting.get(reply.id);
      waiting.delete(reply.id);
      resume?.(Effect.succeed(reply));
    },
    close: () => {
      closed = true;
      queued.clear();
      for (const resume of waiting.values())
        resume(
          Effect.fail(new ClaudeError({ message: "Speech bridge removed" })),
        );
      waiting.clear();
    },
  };
}
