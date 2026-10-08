import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  createSpeechCleaner,
  TableNarrator,
  NarrationFailed,
} from "../src/index.ts";
import { markdownTables } from "../src/replacers/index.ts";
import { narratorLayer } from "../src/ai/Provider.ts";

const table = "| Site | Cost |\n| --- | ---: |\n| A | -£12 |\n| B | £34 |";
test("GFM parsing rewrites real tables, preserving all surrounding text and fenced examples", async () => {
  const seen: string[] = [];
  const input = `Before my_file.\n\n${table}\n\n\`\`\`md\n${table}\n\`\`\`\n\nAfter.`;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([markdownTables]);
      return yield* clean(input);
    }).pipe(
      Effect.provide(
        Layer.succeed(TableNarrator, {
          narrate: (text) =>
            Effect.sync(() => {
              seen.push(text);
              return "Site A costs minus twelve pounds; site B costs thirty-four pounds.";
            }),
        }),
      ),
    ),
  );
  expect(seen).toEqual([table]);
  expect(result.text).toBe(
    `Before my_file.\n\nSite A costs minus twelve pounds; site B costs thirty-four pounds.\n\n\`\`\`md\n${table}\n\`\`\`\n\nAfter.`,
  );
});

test("a failed table leaves the complete input intact, including earlier tables", async () => {
  let calls = 0;
  const input = `${table}\n\nBetween.\n\n${table}`;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const clean = yield* createSpeechCleaner([markdownTables]);
      return yield* clean(input);
    }).pipe(
      Effect.provideService(TableNarrator, {
        narrate: () =>
          ++calls === 1
            ? Effect.succeed("first")
            : Effect.fail(new NarrationFailed({ reason: "provider" })),
      }),
    ),
  );
  expect(result.text).toBe(input);
  expect(result.skipped).toEqual(["markdown-tables"]);
});

test("Effect AI uses the configured chat-completions provider and rejects truncated responses", async () => {
  const requests: Array<{
    url: string;
    authorization: string | null;
    body: unknown;
  }> = [];
  let truncated = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({
        url: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
        body: await request.json(),
      });
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
              content:
                "A costs minus twelve pounds. B costs thirty-four pounds.",
            },
            finish_reason: truncated ? "length" : "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    },
  });
  try {
    const layer = narratorLayer({
      enabled: true,
      apiUrl: `http://127.0.0.1:${server.port}/v1`,
      apiKey: "synthetic-test-key",
      model: "test-model",
    });
    const run = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const clean = yield* createSpeechCleaner([markdownTables]);
          return yield* clean(`Do not send this surrounding text.\n\n${table}`);
        }).pipe(Effect.provide(layer)),
      );
    expect((await run()).text).toBe(
      "Do not send this surrounding text.\n\nA costs minus twelve pounds. B costs thirty-four pounds.",
    );
    expect(requests[0]?.url).toBe("/v1/chat/completions");
    expect(requests[0]?.authorization).toBe("Bearer synthetic-test-key");
    expect(requests[0]?.body).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: expect.stringContaining("untrusted data") },
        { role: "user", content: table },
      ],
    });
    truncated = true;
    expect((await run()).text).toBe(
      `Do not send this surrounding text.\n\n${table}`,
    );
  } finally {
    server.stop(true);
  }
});
