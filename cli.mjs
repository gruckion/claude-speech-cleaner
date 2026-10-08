import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { installDesktop } from "./desktop.mjs";

const action = process.argv[2] ?? "apply";
if (!["apply", "status", "remove"].includes(action))
  throw new Error("Usage: bun cli.mjs [apply|status|remove]");
const waiting = process.argv.includes("--wait");
const keepInspector = process.argv.includes("--keep-inspector");
let target;
const deadline = Date.now() + (waiting ? 120000 : 0);
if (waiting)
  console.log(
    "In Claude, choose Developer → Enable Main Process Debugger. Waiting up to two minutes…",
  );
do {
  try {
    const response = await fetch("http://127.0.0.1:9229/json/list", {
      signal: AbortSignal.timeout(1000),
    });
    const list = await response.json();
    target = list.find((t) =>
      /^\/Applications\/Claude\.app\/Contents\/MacOS\/Claude\[\d+\]$/.test(
        t.title,
      ),
    );
    if (target) break;
  } catch {
    /* The user may still be opening the developer menu. */
  }
  if (Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 1000));
} while (Date.now() < deadline);
if (!target)
  throw new Error(
    "Claude inspector unavailable. Choose Developer → Enable Main Process Debugger, then retry.",
  );
const pid = target.title.match(/\[(\d+)\]$/)[1];
const listeners = execFileSync(
  "/usr/sbin/lsof",
  ["-nP", "-iTCP:9229", "-sTCP:LISTEN", "-Fp"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((line) => line.startsWith("p"));
if (listeners.length !== 1 || listeners[0] !== `p${pid}`)
  throw new Error(
    "Port 9229 is not exclusively owned by the expected Claude process.",
  );
const command = execFileSync("/bin/ps", ["-p", pid, "-o", "comm="], {
  encoding: "utf8",
}).trim();
if (command !== "/Applications/Claude.app/Contents/MacOS/Claude")
  throw new Error("Inspector is not owned by the expected Claude executable.");
const address = new URL(target.webSocketDebuggerUrl);
if (
  address.protocol !== "ws:" ||
  address.hostname !== "127.0.0.1" ||
  address.port !== "9229"
)
  throw new Error("Expected loopback inspector.");
const socket = new WebSocket(address);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error("Inspector connection timeout"));
  }, 5000);
  socket.onopen = () => {
    clearTimeout(timer);
    resolve();
  };
  socket.onerror = () => {
    clearTimeout(timer);
    reject(new Error("Inspector connection failed"));
  };
});
let sequence = 0;
function evaluate(expression) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Inspector operation timeout"));
    }, 15000);
    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      if (message.error || message.result?.exceptionDetails)
        reject(
          new Error(
            "Claude rejected the operation. Its interface may have changed.",
          ),
        );
      else resolve(message.result.result.value);
    }
    socket.addEventListener("message", onMessage);
    socket.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    );
  });
}
try {
  const key = "globalThis[Symbol.for('claude-speech-cleaner-desktop')]";
  let result;
  if (action === "apply") {
    const renderer = await readFile(
      new URL("./renderer.js", import.meta.url),
      "utf8",
    );
    result = await evaluate(
      `(${installDesktop.toString()})(${JSON.stringify(renderer)})`,
    );
    if (!result?.installed || !result.pages?.some((page) => page.active))
      throw new Error(
        "No active Claude conversation renderer found. Open a conversation and reapply.",
      );
  } else
    result = await evaluate(
      `${key} ? ${key}.${action === "remove" ? "remove" : "status"}() : ({ installed: false })`,
    );
  console.log(JSON.stringify(result, null, 2));
  if (action === "apply")
    console.log(
      "Speech cleanup installed for this Claude app run. Use Read aloud to verify frame counters. Reapply after a full app restart.",
    );
} finally {
  let shutdownScheduled = false;
  if (!keepInspector) {
    // Delay closing the server until its reply has reached this client.
    try {
      await evaluate(
        `setTimeout(() => process.getBuiltinModule('inspector').close(), 500); true`,
      );
      shutdownScheduled = true;
    } catch {
      console.error(
        "Could not request debugger shutdown. Turn off Developer → Enable Main Process Debugger.",
      );
      process.exitCode = 1;
    }
  }
  socket.close();
  if (shutdownScheduled) {
    let closed = false;
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        await fetch("http://127.0.0.1:9229/json/list", {
          signal: AbortSignal.timeout(500),
        });
      } catch {
        closed = true;
        break;
      }
    }
    if (closed) console.log("Temporary debugger connection closed.");
    else {
      console.error(
        "Debugger is still reachable. Turn off Developer → Enable Main Process Debugger.",
      );
      process.exitCode = 1;
    }
  }
}
