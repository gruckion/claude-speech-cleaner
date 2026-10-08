import { app, webContents, type WebContents } from "electron";
import {
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Schema,
  Scope,
  Semaphore,
} from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { type ProviderSettings } from "../ai/Provider.ts";
import { cleanerLayer } from "../../speech.config.ts";
import { SpeechCleaner } from "../engine/SpeechCleaner.ts";
import { discoverSpeechModule } from "./discovery.ts";
import { bindingName, ClaudeError, Request } from "./protocol.ts";

const key = Symbol.for("claude-speech-cleaner-desktop");
interface DesktopControl {
  status(): Promise<unknown>;
  remove(): Promise<{ removed: boolean }>;
}
const globals = globalThis as typeof globalThis & { [key]?: DesktopControl };
const ContextCreated = Schema.Struct({
  context: Schema.Struct({
    id: Schema.Number,
    origin: Schema.String,
    auxData: Schema.Struct({ isDefault: Schema.Boolean }),
  }),
});
const BindingCall = Schema.Struct({
  name: Schema.String,
  payload: Schema.String,
  executionContextId: Schema.Number,
});
const Resources = Schema.Array(Schema.String);

const attempt = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: () =>
      new ClaudeError({ message: "Claude renderer operation failed" }),
  });
const allowed = (view: WebContents) =>
  !view.isDestroyed() &&
  new URL(view.getURL() || "about:blank").origin === "https://claude.ai";

/** Electron is an imperative host; the implementation below owns one Effect Scope. */
export async function install(
  rendererSource: string,
  settings: ProviderSettings,
) {
  if (
    app.getName() !== "Claude" ||
    !process.execPath.endsWith("/Claude.app/Contents/MacOS/Claude")
  )
    throw new Error("Only Claude Desktop on macOS is supported");
  const previous = await globals[key]?.remove();
  if (previous && !previous.removed)
    throw new Error(
      "The previous hook could not be restored. Restart Claude before applying.",
    );
  const runtime = ManagedRuntime.make(
    cleanerLayer(settings).pipe(Layer.provideMerge(FetchHttpClient.layer)),
  );
  const scope = Effect.runSync(Scope.make());
  const pages = new Map<number, WebContents>();
  let active = true;
  let failures = 0;
  let injections = 0;
  let removed = true;
  const initialize = Effect.gen(function* () {
    const cleaner = yield* SpeechCleaner;
    const http = yield* HttpClient.HttpClient;
    const watch = Effect.fn("Claude.watch")(function* (view: WebContents) {
      if (pages.has(view.id) || view.isDestroyed()) return;
      pages.set(view.id, view);
      const viewScope = yield* Scope.fork(scope);
      const contexts = new Set<number>();
      const requests = new Map<string, Fiber.Fiber<void>>();
      let attached = false;
      const injectionLock = yield* Semaphore.make(1);
      let documentVersion = 0;
      const send = (method: string, params: Record<string, unknown> = {}) =>
        attempt(() => view.debugger.sendCommand(method, params));
      const deliver = (
        context: number,
        reply: {
          id: string;
          text: string;
          applied: boolean;
          changes: ReadonlyArray<string>;
          skipped: ReadonlyArray<string>;
        },
      ) => {
        if (!active || !allowed(view) || !contexts.has(context))
          return Effect.void;
        return send("Runtime.evaluate", {
          expression: `globalThis.__claudeSpeechCleaner?.deliver(${JSON.stringify(reply)})`,
          contextId: context,
        }).pipe(
          Effect.asVoid,
          Effect.catch(() => Effect.void),
        );
      };
      const onMessage = (
        _event: Electron.Event,
        method: string,
        params: unknown,
      ) => {
        if (method === "Runtime.executionContextsCleared") {
          documentVersion++;
          contexts.clear();
          for (const fiber of requests.values())
            Effect.runFork(Fiber.interrupt(fiber));
          requests.clear();
        }
        if (method === "Runtime.executionContextCreated") {
          const parsed = Schema.decodeUnknownOption(ContextCreated)(params);
          if (
            parsed._tag === "Some" &&
            parsed.value.context.auxData.isDefault &&
            parsed.value.context.origin === "https://claude.ai"
          )
            contexts.add(parsed.value.context.id);
        }
        if (method !== "Runtime.bindingCalled" || !active || !allowed(view))
          return;
        const call = Schema.decodeUnknownOption(BindingCall)(params);
        if (
          call._tag === "None" ||
          call.value.name !== bindingName ||
          !contexts.has(call.value.executionContextId)
        )
          return;
        const parsed = Schema.decodeUnknownOption(
          Schema.fromJsonString(Request),
        )(call.value.payload);
        if (parsed._tag === "None") return;
        const request = parsed.value;
        const context = call.value.executionContextId;
        const requestKey = `${context}:${request.id}`;
        if (request.kind === "cancel") {
          const fiber = requests.get(requestKey);
          if (fiber) Effect.runFork(Fiber.interrupt(fiber));
          return;
        }
        if (requests.has(requestKey)) return;
        if (requests.size >= 4) {
          Effect.runSync(
            Effect.forkIn(
              deliver(context, {
                id: request.id,
                text: request.text,
                applied: false,
                changes: [],
                skipped: ["busy"],
              }),
              viewScope,
            ),
          );
          return;
        }
        const work = Effect.gen(function* () {
          yield* Effect.yieldNow;
          const result = yield* cleaner.replace(request.text);
          yield* deliver(context, { id: request.id, ...result });
        }).pipe(
          Effect.ensuring(Effect.sync(() => requests.delete(requestKey))),
        );
        const fiber = Effect.runSync(Effect.forkIn(work, viewScope));
        requests.set(requestKey, fiber);
      };
      const inject = Effect.gen(function* () {
        if (!active || !allowed(view)) return;
        const startedVersion = documentVersion;
        if (!attached) {
          if (view.debugger.isAttached())
            return yield* new ClaudeError({
              message: "Renderer debugger already in use",
            });
          yield* Effect.try({
            try: () => view.debugger.attach("1.3"),
            catch: () =>
              new ClaudeError({ message: "Cannot attach renderer debugger" }),
          });
          attached = true;
          yield* send("Runtime.enable");
          yield* send("Runtime.addBinding", { name: bindingName });
        }
        const resources = yield* attempt(() =>
          view.executeJavaScript(
            "[...document.querySelectorAll('script[src],link[rel=modulepreload]')].map(e => e.src || e.href).concat(performance.getEntriesByType('resource').map(e => e.name))",
          ),
        );
        const urls = yield* Schema.decodeUnknownEffect(Resources)(resources);
        const moduleUrl = yield* discoverSpeechModule(urls).pipe(
          Effect.provideService(HttpClient.HttpClient, http),
        );
        if (startedVersion !== documentVersion || !active || !allowed(view))
          return;
        // The old v1 runtime has already been removed by its control above.
        const result = yield* attempt(() =>
          view.executeJavaScript(
            `${rendererSource}\nglobalThis.__claudeSpeechActivate(${JSON.stringify(moduleUrl)})`,
          ),
        );
        const status = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ active: Schema.Boolean }),
        )(result);
        if (!status.active)
          return yield* new ClaudeError({
            message: "Speech hook did not activate",
          });
        injections++;
      }).pipe(
        injectionLock.withPermits(1),
        Effect.catchCause(() =>
          Effect.sync(() => {
            failures++;
          }),
        ),
      );
      const onReady = () => {
        documentVersion++;
        Effect.runSync(Effect.forkIn(inject, viewScope));
      };
      const onDestroyed = () => {
        pages.delete(view.id);
        Effect.runFork(Scope.close(viewScope, Exit.void));
      };
      const onDetached = () => {
        attached = false;
        contexts.clear();
        for (const fiber of requests.values())
          Effect.runFork(Fiber.interrupt(fiber));
        if (active && allowed(view))
          Effect.runSync(
            Effect.forkIn(
              attempt(() =>
                view.executeJavaScript(
                  "globalThis.__claudeSpeechCleaner?.undo()",
                ),
              ).pipe(Effect.ignore),
              viewScope,
            ),
          );
      };
      view.debugger.on("message", onMessage);
      view.debugger.on("detach", onDetached);
      view.on("dom-ready", onReady);
      view.once("destroyed", onDestroyed);
      yield* Scope.addFinalizer(
        viewScope,
        Effect.gen(function* () {
          if (view.isDestroyed()) return;
          view.off("dom-ready", onReady);
          view.off("destroyed", onDestroyed);
          view.debugger.off("message", onMessage);
          view.debugger.off("detach", onDetached);
          for (const fiber of requests.values()) yield* Fiber.interrupt(fiber);
          if (allowed(view)) {
            const undone = yield* attempt(() =>
              view.executeJavaScript(
                "globalThis.__claudeSpeechCleaner?.undo() ?? true",
              ),
            ).pipe(Effect.catch(() => Effect.succeed(false)));
            if (undone !== true) removed = false;
          }
          if (attached) {
            yield* send("Runtime.removeBinding", { name: bindingName }).pipe(
              Effect.ignore,
            );
            if (view.debugger.isAttached()) view.debugger.detach();
          }
        }),
      );
      yield* inject;
    });
    const onCreated = (_event: Electron.Event, view: WebContents) => {
      Effect.runSync(
        Effect.forkIn(
          watch(view).pipe(Effect.provideService(Scope.Scope, scope)),
          scope,
        ),
      );
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => app.on("web-contents-created", onCreated)),
      () => Effect.sync(() => app.off("web-contents-created", onCreated)),
    );
    yield* Effect.forEach(webContents.getAllWebContents(), watch, {
      concurrency: 2,
    });
  }).pipe(Effect.provideService(Scope.Scope, scope));
  const control: DesktopControl = {
    status: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const statuses = yield* Effect.forEach(
            [...pages.values()].filter(allowed),
            (view) =>
              attempt(() =>
                view.executeJavaScript(
                  "globalThis.__claudeSpeechCleaner?.status() ?? { active: false }",
                ),
              ).pipe(Effect.catch(() => Effect.succeed({ active: false }))),
          );
          return {
            installed: active,
            appVersion: app.getVersion(),
            aiEnabled: settings.enabled,
            failures,
            injections,
            pages: statuses,
          };
        }),
      ),
    remove: async () => {
      active = false;
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await runtime.dispose();
      pages.clear();
      if (globals[key] === control) delete globals[key];
      return { removed };
    },
  };
  globals[key] = control;
  try {
    await runtime.runPromise(initialize);
    if (injections === 0)
      throw new Error(
        "No active speech hook. Open a Claude conversation and retry; close renderer DevTools if open.",
      );
    return await control.status();
  } catch (error) {
    await control.remove();
    throw error;
  }
}
