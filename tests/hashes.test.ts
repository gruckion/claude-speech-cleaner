import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import type { ProviderSettings } from "../src/ai/Provider.ts";
import { cleanerLayer } from "../speech.config.ts";
import { SpeechCleaner } from "../src/engine/SpeechCleaner.ts";

const Body = Schema.Struct({
  state: Schema.Struct({
    candidates: Schema.Array(
      Schema.Struct({ value: Schema.String, context: Schema.String }),
    ),
  }),
  questions: Schema.Record(Schema.String, Schema.Unknown),
});
const yes = { type: "noul", noul: 0.99 };

test("configured hash speech classifies visible candidates with bounded context and shortens only matches", async () => {
  const bodies: Array<typeof Body.Type> = [];
  const auth: Array<string | null> = [];
  let answers: unknown = {
    hash_0: yes,
    hash_1: yes,
    hash_2: { type: "noul", noul: 0.01 },
  };
  let status = 200;
  let slow = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      auth.push(request.headers.get("authorization"));
      bodies.push(Schema.decodeUnknownSync(Body)(await request.json()));
      if (slow) await new Promise((resolve) => setTimeout(resolve, 1800));
      return Response.json({ answers }, { status });
    },
  });
  const settings = {
    enabled: true,
    codeEnabled: false,
    hashEnabled: true,
    apiKey: "unused",
    apiUrl: "http://127.0.0.1:1",
    model: "unused",
    classifier: {
      apiKey: "synthetic-jev-key",
      model: "test-jev",
      apiUrl: `http://127.0.0.1:${server.port}`,
    },
  };
  const run = (source: string, config: ProviderSettings = settings) =>
    Effect.runPromise(
      SpeechCleaner.use((cleaner) => cleaner.replace(source)).pipe(
        Effect.provide(cleanerLayer(config)),
      ),
    );
  try {
    const source =
      "Migration `2bde899ec541` follows [b310dd58c6da](https://example.com/secret/deadbeef1234). Invoice 12345678 is unrelated.";
    expect((await run(source)).text).toBe(
      "Migration `hash ending c541` follows [hash ending c6da](https://example.com/secret/deadbeef1234). Invoice 12345678 is unrelated.",
    );
    expect(auth).toEqual(["Bearer synthetic-jev-key"]);
    expect(bodies[0]?.state.candidates.map((item) => item.value)).toEqual([
      "2bde899ec541",
      "b310dd58c6da",
      "12345678",
    ]);
    expect(bodies[0]?.state.candidates[0]?.context).toContain("Migration");
    expect(JSON.stringify(bodies)).not.toContain("secret");
    expect(Object.keys(bodies[0]!.questions)).toEqual([
      "hash_0",
      "hash_1",
      "hash_2",
    ]);

    const before = bodies.length;
    const excluded =
      "[cancel](https://example.com/deadbeef1234) https://example.com/abcdef123456\n\n```sh\ngit checkout abcdef123456\n```\n\n`src/abcdef123456.py` abcdef123456_name";
    await run(excluded);
    expect(bodies).toHaveLength(before);
    await run(source, { ...settings, hashEnabled: false });
    await run(source, { ...settings, enabled: false });
    expect(
      (await run(source, { ...settings, classifier: undefined })).text,
    ).toBe(source);
    expect(bodies).toHaveLength(before);

    for (answers of [
      {},
      { hash_0: { type: "noul", noul: 0.6 } },
      { hash_0: { type: "noul", noul: 1.5 } },
      { hash_0: { type: "choice", choice: "hash" } },
    ]) {
      expect((await run("Commit abcdef123456.")).text).toBe(
        "Commit abcdef123456.",
      );
    }
    status = 503;
    expect((await run("Commit abcdef123456.")).text).toBe(
      "Commit abcdef123456.",
    );
    status = 200;
    answers = { hash_0: yes };
    await run(
      "unrelated paragraph\n\n" +
        "Padding ".repeat(100) +
        "Commit abcdef123456. " +
        "After ".repeat(100),
    );
    const context = bodies.at(-1)!.state.candidates[0]!.context;
    expect(context).toContain("Commit abcdef123456");
    expect(context.length).toBeLessThanOrEqual(384);
    expect(context).not.toContain("unrelated paragraph");
    expect((await run("Commit DEADBEEF.")).text).toBe(
      "Commit hash ending BEEF.",
    );
    await run(
      Array.from({ length: 40 }, () => "Commit abcdef123456.").join("\n\n"),
    );
    expect(bodies.at(-1)?.state.candidates).toHaveLength(32);
    slow = true;
    expect((await run("Commit abcdef123456.")).text).toBe(
      "Commit abcdef123456.",
    );
  } finally {
    server.stop(true);
  }
});
