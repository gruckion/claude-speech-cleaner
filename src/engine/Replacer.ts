import { Effect, Schema } from "effect";

/** A rule sees the output of the preceding rule. Never mutate the conversation. */
export interface Replacer<E = never, R = never> {
  readonly id: string;
  readonly description: string;
  readonly matches?: (text: string) => boolean;
  readonly replace: (text: string) => Effect.Effect<string, E, R>;
}

export const defineReplacer = <E, R>(rule: Replacer<E, R>): Replacer<E, R> =>
  rule;

export class InvalidRegistry extends Schema.TaggedError<InvalidRegistry>()(
  "InvalidRegistry",
  { message: Schema.String },
) {}

export interface ReplacementResult {
  readonly text: string;
  readonly applied: boolean;
  readonly changes: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
}

/** Validate once; callers retain the union of their replacers' requirements. */
export const createSpeechCleaner = Effect.fnUntraced(function* <E, R>(
  rules: ReadonlyArray<Replacer<E, R>>,
  options: { readonly timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 4000;
  const registry = [...rules];
  const names = new Set<string>();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    return yield* new InvalidRegistry({
      message: "timeoutMs must be positive",
    });
  for (const rule of registry) {
    if (!rule.id.trim() || names.has(rule.id))
      return yield* new InvalidRegistry({
        message: `Empty or duplicate replacer id: ${rule.id}`,
      });
    names.add(rule.id);
  }
  return Effect.fn("SpeechCleaner.replace")(function* (
    input: string,
  ): Effect.fn.Return<ReplacementResult, never, R> {
    let text = input;
    const changes: string[] = [];
    const skipped: string[] = [];
    for (const rule of registry) {
      const before = text;
      text = yield* Effect.suspend(() =>
        rule.matches && !rule.matches(before)
          ? Effect.succeed(before)
          : rule.replace(before),
      ).pipe(
        Effect.timeout(timeoutMs),
        Effect.catchCause(() => {
          skipped.push(rule.id);
          return Effect.succeed(before);
        }),
      );
      if (text !== before) changes.push(rule.id);
    }
    return { text, applied: text !== input, changes, skipped };
  });
});
