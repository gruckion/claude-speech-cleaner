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
import { ClaudeError, Mailbox } from "./protocol.ts";

const key = Symbol.for("claude-speech-cleaner-desktop");
interface DesktopControl {
  status(): Promise<unknown>;
  remove(): Promise<{ removed: boolean }>;
}
const globals = globalThis as typeof globalThis & { [key]?: DesktopControl };
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
      const requests = new Map<string, Fiber.Fiber<void>>();
      const injectionLock = yield* Semaphore.make(1);
      let documentVersion = 0;
      let instance: string | undefined;
      const cancelRequests = () => {
        for (const fiber of requests.values())
          Effect.runFork(Fiber.interrupt(fiber));
        requests.clear();
      };
      const deliver = (
        target: string,
        reply: {
          id: string;
          text: string;
          applied: boolean;
          changes: ReadonlyArray<string>;
          skipped: ReadonlyArray<string>;
        },
      ) => {
        if (!active || !allowed(view) || target !== instance)
          return Effect.void;
        return attempt(() =>
          view.executeJavaScript(
            `globalThis.__claudeSpeechCleaner?.deliver(${JSON.stringify(target)}, ${JSON.stringify(reply)})`,
          ),
        ).pipe(Effect.asVoid, Effect.ignore);
      };
      const poll = Effect.gen(function* () {
        if (!active || !allowed(view)) return;
        const version = documentVersion;
        const input = yield* attempt(() =>
          view.executeJavaScript(
            "globalThis.__claudeSpeechCleaner?.drain() ?? null",
          ),
        );
        if (!active || version !== documentVersion) return;
        const parsed = Schema.decodeUnknownOption(Mailbox)(input);
        if (parsed._tag === "None") return;
        const packet = parsed.value;
        if (instance !== packet.instance) {
          cancelRequests();
          instance = packet.instance;
        }
        for (const request of packet.requests) {
          if (request.kind === "cancel") {
            const fiber = requests.get(request.id);
            if (fiber) yield* Fiber.interrupt(fiber);
            continue;
          }
          if (requests.has(request.id)) continue;
          if (requests.size >= 4) {
            yield* deliver(packet.instance, {
              id: request.id,
              text: request.text,
              applied: false,
              changes: [],
              skipped: ["busy"],
            });
            continue;
          }
          const work = Effect.gen(function* () {
            yield* Effect.yieldNow;
            const result = yield* cleaner.replace(request.text);
            yield* deliver(packet.instance, { id: request.id, ...result });
          }).pipe(
            Effect.ensuring(Effect.sync(() => requests.delete(request.id))),
          );
          requests.set(request.id, yield* Effect.forkIn(work, viewScope));
        }
      }).pipe(Effect.ignore);
      const inject = Effect.gen(function* () {
        if (!active || !allowed(view)) return;
        const startedVersion = documentVersion;
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
      const onNavigate = (
        _event: Electron.Event,
        _url: string,
        inPlace: boolean,
        mainFrame: boolean,
      ) => {
        if (inPlace || !mainFrame) return;
        documentVersion++;
        instance = undefined;
        cancelRequests();
      };
      const onReady = () => {
        documentVersion++;
        instance = undefined;
        cancelRequests();
        Effect.runSync(Effect.forkIn(inject, viewScope));
      };
      const onDestroyed = () => {
        pages.delete(view.id);
        Effect.runFork(Scope.close(viewScope, Exit.void));
      };
      view.on("did-start-navigation", onNavigate);
      view.on("dom-ready", onReady);
      view.once("destroyed", onDestroyed);
      yield* Scope.addFinalizer(
        viewScope,
        Effect.gen(function* () {
          if (view.isDestroyed()) return;
          view.off("dom-ready", onReady);
          view.off("destroyed", onDestroyed);
          view.off("did-start-navigation", onNavigate);
          for (const fiber of requests.values()) yield* Fiber.interrupt(fiber);
          if (allowed(view)) {
            const undone = yield* attempt(() =>
              view.executeJavaScript(
                "globalThis.__claudeSpeechCleaner?.undo() ?? true",
              ),
            ).pipe(Effect.catch(() => Effect.succeed(false)));
            if (undone !== true) removed = false;
          }
        }),
      );
      yield* inject;
      yield* Effect.forkIn(
        Effect.gen(function* () {
          while (active && !view.isDestroyed()) {
            yield* poll;
            yield* Effect.sleep(200);
          }
        }),
        viewScope,
      );
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
            codeNarrationEnabled: settings.enabled && settings.codeEnabled,
            hashClassificationEnabled: !!(
              settings.enabled &&
              settings.hashEnabled &&
              settings.classifier
            ),
            blockClassificationEnabled:
              settings.enabled &&
              settings.codeEnabled &&
              settings.classifier !== undefined,
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
        "No active speech hook. Open a Claude conversation and retry.",
      );
    return await control.status();
  } catch (error) {
    await control.remove();
    throw error;
  }
}
