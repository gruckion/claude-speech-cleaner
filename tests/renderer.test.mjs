import { test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Owns the speech wire contract: a real receiver checks what actually left the
// sender, including the negative controls that protect generated code traffic.
test("rewrites only same-host TTS text; ordinary traffic and undo preserve bytes", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return;
      return new Response("", { status: 404 });
    },
    websocket: {
      message(socket, data) {
        socket.send(data);
      },
    },
  });
  class IsolatedSocket extends WebSocket {}
  const host = `127.0.0.1:${server.port}`;
  const speech = `ws://${host}/api/ws/text_to_speech/text_stream`;
  const input = JSON.stringify({
    type: "text_chunk",
    text: "Open my_project/release-notes.md.",
    request_id: "keep-this_id",
  });
  const source = await readFile(
    new URL("../renderer.js", import.meta.url),
    "utf8",
  );
  const context = {
    WebSocket: IsolatedSocket,
    URL,
    location: { host },
    Symbol,
  };
  async function echo(url, data) {
    const socket = new IsolatedSocket(url);
    socket.binaryType = "arraybuffer";
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("echo timed out"));
      }, 2000);
      socket.onopen = () => socket.send(data);
      socket.onmessage = (e) => {
        clearTimeout(timer);
        socket.close();
        resolve(e.data);
      };
      socket.onerror = () => {
        clearTimeout(timer);
        socket.close();
        reject(new Error("socket failed"));
      };
    });
  }
  let patch;
  try {
    // Red control: the unpatched wire retains the unwanted separators.
    expect(await echo(speech, input)).toBe(input);
    patch = runInNewContext(source, context);
    expect(runInNewContext(source, context)).toBe(patch);
    expect(patch.active).toBe(true);
    expect(JSON.parse(await echo(speech, input))).toEqual({
      type: "text_chunk",
      text: "Open my project/release notes.md.",
      request_id: "keep-this_id",
    });
    for (const [url, data] of [
      [`ws://${host}/agent-session`, input],
      [speech + "-different", input],
      [
        speech,
        JSON.stringify({
          type: "tool_result",
          text: "my_project/release-notes.md",
        }),
      ],
      [speech, '{"type":"close_stream","id":"keep-this_id"}'],
      [speech, '{"type":"text_chunk","text":123}'],
      [speech, "not-json_under-score"],
    ])
      expect(await echo(url, data)).toBe(data);
    // A different hostname on the same loopback receiver must not be changed.
    expect(await echo(speech.replace("127.0.0.1", "localhost"), input)).toBe(
      input,
    );
    const binary = new Uint8Array([45, 95, 0, 255]);
    expect(new Uint8Array(await echo(speech, binary))).toEqual(binary);
    expect(patch.stats.changedFrames).toBe(1);
    expect(patch.undo()).toBe(true);
    expect(patch.active).toBe(false);
    expect(await echo(speech, input)).toBe(input);
  } finally {
    patch?.undo();
    server.stop(true);
  }
});
