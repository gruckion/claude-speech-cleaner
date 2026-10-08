import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { TableNarrator } from "./TableNarrator.ts";
import { CodeNarrator } from "./CodeNarrator.ts";
import { NarrationFailed } from "./Narration.ts";

export const ProviderSettings = Schema.Struct({
  enabled: Schema.Boolean,
  codeEnabled: Schema.Boolean,
  apiKey: Schema.String,
  apiUrl: Schema.String,
  model: Schema.String,
  reasoningEffort: Schema.optional(
    Schema.Literals([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]),
  ),
});
export type ProviderSettings = typeof ProviderSettings.Type;

export const readProviderSettings = Effect.gen(function* () {
  const enabled = yield* Config.Boolean("SPEECH_AI_ENABLED").pipe(
    Config.withDefault(false),
  );
  if (!enabled)
    return {
      enabled: false,
      codeEnabled: false,
      apiKey: "",
      apiUrl: "",
      model: "",
    };
  const codeEnabled = yield* Config.Boolean("SPEECH_AI_CODE_ENABLED").pipe(
    Config.withDefault(false),
  );
  const apiKey = yield* Config.Redacted("SPEECH_AI_API_KEY");
  const apiUrl = yield* Config.String("SPEECH_AI_BASE_URL");
  const model = yield* Config.String("SPEECH_AI_MODEL");
  const reasoningEffort = yield* Config.Literals(
    ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    "SPEECH_AI_REASONING_EFFORT",
  ).pipe(Config.option);
  return {
    enabled,
    codeEnabled,
    apiKey: Redacted.value(apiKey),
    apiUrl,
    model,
    ...(Option.isSome(reasoningEffort)
      ? { reasoningEffort: reasoningEffort.value }
      : {}),
  };
});

const disabledNarration = {
  narrate: () => Effect.fail(new NarrationFailed({ reason: "disabled" })),
};
const disabledCode = Layer.succeed(
  CodeNarrator,
  CodeNarrator.of(disabledNarration),
);

/** Both narrators share a provider, but code transmission requires its own opt-in. */
export const narratorLayer = (settings: ProviderSettings) => {
  if (!settings.enabled)
    return Layer.mergeAll(
      Layer.succeed(TableNarrator, TableNarrator.of(disabledNarration)),
      disabledCode,
    );
  return Layer.mergeAll(
    TableNarrator.layer,
    settings.codeEnabled ? CodeNarrator.layer : disabledCode,
  ).pipe(
    Layer.provide(
      OpenAiLanguageModel.layer({
        model: settings.model,
        config:
          settings.reasoningEffort === undefined
            ? {}
            : { reasoning_effort: settings.reasoningEffort },
      }).pipe(
        Layer.provide(
          OpenAiClient.layer({
            apiKey: Redacted.make(settings.apiKey),
            apiUrl: settings.apiUrl,
          }).pipe(Layer.provide(FetchHttpClient.layer)),
        ),
      ),
    ),
  );
};
