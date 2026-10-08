import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Schema } from "effect";
import * as esbuild from "esbuild";

class BuildFailed extends Schema.TaggedError<BuildFailed>()("BuildFailed", {
  message: Schema.String,
}) {}
const build = (options: esbuild.BuildOptions) =>
  Effect.tryPromise({
    try: () => esbuild.build(options),
    catch: () => new BuildFailed({ message: "Bundler failed" }),
  });

Effect.gen(function* () {
  yield* build({
    entryPoints: ["src/claude/renderer.ts"],
    bundle: true,
    platform: "browser",
    target: "chrome130",
    format: "iife",
    outfile: "dist/renderer.js",
    minify: true,
  });
  yield* build({
    entryPoints: ["src/claude/desktop.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    define: { "import.meta": "{}" },
    external: ["electron"],
    outfile: "dist/desktop.cjs",
  });
  yield* Console.log("Built renderer and desktop adapters.");
}).pipe(BunRuntime.runMain);
