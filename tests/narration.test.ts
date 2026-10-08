import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import type { ProviderSettings } from "../src/ai/Provider.ts";
import { cleanerLayer } from "../speech.config.ts";
import { SpeechCleaner } from "../src/engine/SpeechCleaner.ts";

test("configured AI narrates only opted-in blocks and falls back on truncated output", async () => {
  const table = "| Site | Cost |\n| --- | ---: |\n| A | -£12 |";
  const code = "```ts\nconst total = price * quantity;\n```";
  const tableSpeech = "Site A costs minus twelve pounds.";
  const codeSpeech =
    "This calculates the total by multiplying price by quantity.";
  const input = `Private surrounding text.\n\n${table}\n\n${code}\n\nAfter.`;
  const requests: Array<{
    url: string;
    authorization: string | null;
    body: unknown;
  }> = [];
  const Body = Schema.Struct({
    messages: Schema.Array(
      Schema.Struct({ role: Schema.String, content: Schema.String }),
    ),
  });
  let truncated = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body: unknown = await request.json();
      requests.push({
        url: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
        body,
      });
      const decoded = Schema.decodeUnknownSync(Body)(body);
      const isCode = decoded.messages.some(
        (message) => message.role === "user" && message.content === code,
      );
      return Response.json({
        id: "test",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: isCode ? codeSpeech : tableSpeech,
            },
            finish_reason: truncated ? "length" : "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    },
  });
  const settings: ProviderSettings = {
    enabled: true,
    codeEnabled: true,
    apiUrl: `http://127.0.0.1:${server.port}/v1`,
    apiKey: "synthetic-test-key",
    model: "test-model",
    reasoningEffort: "none",
  };
  const run = (source: string, config = settings) =>
    Effect.runPromise(
      SpeechCleaner.use((cleaner) => cleaner.replace(source)).pipe(
        Effect.provide(cleanerLayer(config)),
      ),
    );
  try {
    expect((await run(input)).text).toBe(
      `Private surrounding text.\n\n${tableSpeech}\n\nCode summary: ${codeSpeech}\n\nAfter.`,
    );
    expect(requests).toHaveLength(2);
    for (const [index, source] of [table, code].entries()) {
      expect(requests[index]).toMatchObject({
        url: "/v1/chat/completions",
        authorization: "Bearer synthetic-test-key",
        body: {
          model: "test-model",
          reasoning_effort: "none",
          messages: [
            {
              role: "system",
              content: expect.stringContaining("untrusted data"),
            },
            { role: "user", content: source },
          ],
        },
      });
    }
    truncated = true;
    const fallback = await run(input);
    expect(fallback.text).toBe(input);
    expect(fallback.skipped).toEqual(["markdown-tables", "code-blocks"]);
    const requestCount = requests.length;
    expect((await run(code, { ...settings, codeEnabled: false })).text).toBe(
      code,
    );
    expect((await run(input, { ...settings, enabled: false })).text).toBe(
      input,
    );
    expect(requests).toHaveLength(requestCount);
  } finally {
    server.stop(true);
  }
});
