import { Deferred, Effect, Schedule, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { Socket } from "effect/socket";
import { ClaudeError } from "../claude/protocol.ts";

const Target = Schema.Struct({
  title: Schema.String,
  webSocketDebuggerUrl: Schema.String,
});
const Response = Schema.Struct({
  id: Schema.Number,
  error: Schema.optional(Schema.Unknown),
  result: Schema.optional(
    Schema.Struct({
      exceptionDetails: Schema.optional(Schema.Unknown),
      result: Schema.optional(
        Schema.Struct({ value: Schema.optional(Schema.Unknown) }),
      ),
    }),
  ),
});
const endpoint = "http://127.0.0.1:9229/json/list";
const executable = "/Applications/Claude.app/Contents/MacOS/Claude";

export const connectInspector = Effect.fn("Inspector.connect")(function* (
  wait: boolean,
) {
  const http = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const find = http.get(endpoint).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Target))),
    Effect.flatMap((targets) => {
      const target = targets.find((t) =>
        /^\/Applications\/Claude\.app\/Contents\/MacOS\/Claude\[\d+\]$/.test(
          t.title,
        ),
      );
      return target
        ? Effect.succeed(target)
        : Effect.fail(
            new ClaudeError({ message: "Claude debugger unavailable" }),
          );
    }),
    Effect.timeout(1000),
  );
  const target = yield* (
    wait
      ? find.pipe(Effect.retry(Schedule.spaced(1000)), Effect.timeout(120000))
      : find
  ).pipe(
    Effect.mapError(
      () =>
        new ClaudeError({
          message:
            "Choose Developer → Enable Main Process Debugger in Claude, then retry.",
        }),
    ),
  );
  const pid = target.title.match(/\[(\d+)\]$/)?.[1];
  const listeners = yield* spawner.string(
    ChildProcess.make("/usr/sbin/lsof", [
      "-nP",
      "-iTCP:9229",
      "-sTCP:LISTEN",
      "-Fp",
    ]),
  );
  const owners = listeners
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("p"));
  if (!pid || owners.length !== 1 || owners[0] !== `p${pid}`)
    return yield* new ClaudeError({
      message: "Port 9229 is not owned exclusively by Claude",
    });
  const command = yield* spawner.string(
    ChildProcess.make("/bin/ps", ["-p", pid, "-o", "comm="]),
  );
  if (command.trim() !== executable)
    return yield* new ClaudeError({
      message: "Unexpected debugger executable",
    });
  const address = yield* Effect.try({
    try: () => new URL(target.webSocketDebuggerUrl),
    catch: () => new ClaudeError({ message: "Invalid debugger URL" }),
  });
  if (
    address.protocol !== "ws:" ||
    address.hostname !== "127.0.0.1" ||
    address.port !== "9229"
  )
    return yield* new ClaudeError({ message: "Expected a loopback debugger" });
  const socket = yield* Socket.makeWebSocket(address.href, {
    openTimeout: 5000,
  });
  const pull = yield* Socket.readerString(socket);
  const { write } = yield* socket.writer;
  let sequence = 0;
  const waiting = new Map<number, Deferred.Deferred<unknown, ClaudeError>>();
  yield* Effect.forkScoped(
    Effect.forever(
      Effect.gen(function* () {
        const messages = yield* pull;
        for (const message of messages) {
          const parsed = Schema.decodeUnknownOption(
            Schema.fromJsonString(Response),
          )(message);
          if (parsed._tag === "None") continue;
          const response = parsed.value;
          const deferred = waiting.get(response.id);
          if (!deferred) continue;
          if (response.error || response.result?.exceptionDetails)
            yield* Deferred.fail(
              deferred,
              new ClaudeError({
                message:
                  "Claude rejected the operation; its adapter may need updating",
              }),
            );
          else
            yield* Deferred.succeed(deferred, response.result?.result?.value);
        }
      }),
    ).pipe(
      Effect.catchCause(() =>
        Effect.forEach(
          waiting.values(),
          (deferred) =>
            Deferred.fail(
              deferred,
              new ClaudeError({ message: "Debugger disconnected" }),
            ),
          { discard: true },
        ),
      ),
    ),
  );
  const evaluate = Effect.fn("Inspector.evaluate")(function* (
    expression: string,
  ) {
    const id = ++sequence;
    const deferred = yield* Deferred.make<unknown, ClaudeError>();
    waiting.set(id, deferred);
    return yield* write(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    ).pipe(
      Effect.andThen(Deferred.await(deferred)),
      Effect.timeout(90000),
      Effect.ensuring(Effect.sync(() => waiting.delete(id))),
    );
  });
  const shutdown = Effect.gen(function* () {
    yield* evaluate(
      "setTimeout(() => process.getBuiltinModule('inspector').close(), 500); true",
    );
    yield* write(new Socket.CloseEvent());
    yield* Effect.sleep(600);
    const closed = http
      .get(endpoint)
      .pipe(
        Effect.timeout(500),
        Effect.match({ onFailure: () => true, onSuccess: () => false }),
      );
    const done = yield* closed.pipe(
      Effect.repeat({
        while: (value) => !value,
        schedule: Schedule.recurs(20).pipe(
          Schedule.addDelay(() => Effect.succeed(100)),
        ),
      }),
    );
    if (!done)
      return yield* new ClaudeError({
        message:
          "Debugger remains open. Disable Developer → Enable Main Process Debugger.",
      });
  });
  return { evaluate, shutdown };
});
