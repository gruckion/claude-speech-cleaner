/* Claude speech-only renderer patch. Run in the page's MAIN world, not a Code mod.
 * Only the speech WebSocket's text_chunk frames change. Use the CLI to remove.
 * No message text is logged or retained. */
(() => {
  const key = Symbol.for("claude-speech-cleaner");
  if (globalThis[key]) return globalThis[key];
  const prototype = WebSocket.prototype;
  const original = prototype.send;
  const endpoint = "/api/ws/text_to_speech/text_stream";
  const stats = { speechFrames: 0, changedFrames: 0 };
  function send(data) {
    let outgoing = data;
    try {
      const url = new URL(this.url);
      if (
        url.host === location.host &&
        url.pathname === endpoint &&
        typeof data === "string"
      ) {
        const frame = JSON.parse(data);
        if (frame?.type === "text_chunk" && typeof frame.text === "string") {
          stats.speechFrames++;
          const text = frame.text.replace(/[-_]+/g, " ");
          if (text !== frame.text) {
            outgoing = JSON.stringify({ ...frame, text });
            stats.changedFrames++;
          }
        }
      }
    } catch {
      /* Let the native sender handle non-JSON and invalid calls. */
    }
    return Reflect.apply(original, this, [outgoing]);
  }
  prototype.send = send;
  const control = {
    version: "1.0.0",
    get active() {
      return prototype.send === send;
    },
    stats,
    undo() {
      if (prototype.send !== send) return false;
      prototype.send = original;
      delete globalThis[key];
      return true;
    },
  };
  globalThis[key] = control;
  return control;
})();
