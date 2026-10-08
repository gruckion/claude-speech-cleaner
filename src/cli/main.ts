import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { FetchHttpClient } from "effect/http";
import { Socket } from "effect/socket";
import { readProviderSettings } from "../ai/Provider.ts";
import { cleanerLayer } from "../../speech.config.ts";
import { SpeechCleaner } from "../engine/SpeechCleaner.ts";
import { ClaudeError } from "../claude/protocol.ts";
import { connectInspector } from "./Inspector.ts";

const runDesktop = Effect.fn("Cli.desktop")(function* (
  action: "apply" | "status" | "remove",
  wait: boolean,
) {
  // Read credentials only for apply, never for status/remove.
  const settings = action === "apply" ? yield* readProviderSettings : undefined;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("../../", import.meta.url));
  const renderer =
    action === "apply"
      ? yield* fs.readFileString(path.join(root, "dist/renderer.js"))
      : "";
  if (wait)
    yield* Console.log(
      "In Claude, choose Developer → Enable Main Process Debugger. Waiting up to two minutes…",
    );
  const inspector = yield* connectInspector(wait);
  const key = "globalThis[Symbol.for('claude-speech-cleaner-desktop')]";
  const operation =
    action === "apply"
      ? `(() => { const require = process.getBuiltinModule('module').createRequire(process.execPath); const path = ${JSON.stringify(path.join(root, "dist/desktop.cjs"))}; delete require.cache[require.resolve(path)]; return require(path).install(${JSON.stringify(renderer)}, ${JSON.stringify(settings)}); })()`
      : `${key} ? ${key}.${action}() : ({ installed: false })`;
  const result = yield* inspector.evaluate(operation);
  yield* Console.log(JSON.stringify(result, null, 2));
  if (action === "remove") {
    const decoded = Schema.decodeUnknownOption(
      Schema.Struct({ removed: Schema.Boolean }),
    )(result);
    if (decoded._tag === "Some" && !decoded.value.removed)
      return yield* new ClaudeError({
        message:
          "Could not restore another wrapper. Restart Claude to clear it.",
      });
  }
});
const wait = Flag.Boolean("wait").pipe(Flag.withDefault(false));
const apply = Command.make("apply", { wait }, ({ wait }) =>
  runDesktop("apply", wait).pipe(Effect.scoped),
);
const status = Command.make("status", {}, () =>
  runDesktop("status", false).pipe(Effect.scoped),
);
const remove = Command.make("remove", {}, () =>
  runDesktop("remove", false).pipe(Effect.scoped),
);
const preview = Command.make(
  "preview",
  { file: Argument.String("file") },
  Effect.fn(function* ({ file }) {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    const settings = yield* readProviderSettings;
    const result = yield* SpeechCleaner.use((cleaner) =>
      cleaner.replace(text),
    ).pipe(Effect.provide(cleanerLayer(settings)));
    yield* Console.log(result.text);
    if (result.skipped.length)
      yield* Console.error(`Skipped: ${result.skipped.join(", ")}`);
  }),
);

Command.make("claude-speech-cleaner").pipe(
  Command.withSubcommands([apply, status, remove, preview]),
  Command.run({ version: "2.1.0" }),
  Effect.provide([
    BunServices.layer,
    FetchHttpClient.layer,
    Socket.layerWebSocketConstructorGlobal,
  ]),
  BunRuntime.runMain,
);
