import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { TableNarrator, NarrationFailed } from "./TableNarrator.ts";

export const ProviderSettings = Schema.Struct({
  enabled: Schema.Boolean,
  apiKey: Schema.String,
  apiUrl: Schema.String,
  model: Schema.String,
});
export type ProviderSettings = typeof ProviderSettings.Type;

export const readProviderSettings = Effect.gen(function* () {
  const enabled = yield* Config.Boolean("SPEECH_AI_ENABLED").pipe(
    Config.withDefault(false),
  );
  if (!enabled) return { enabled: false, apiKey: "", apiUrl: "", model: "" };
  const apiKey = yield* Config.Redacted("SPEECH_AI_API_KEY");
  const apiUrl = yield* Config.String("SPEECH_AI_BASE_URL");
  const model = yield* Config.String("SPEECH_AI_MODEL");
  return { enabled, apiKey: Redacted.value(apiKey), apiUrl, model };
});

/** Provider-specific composition is confined here; replacers use TableNarrator. */
export const narratorLayer = (settings: ProviderSettings) =>
  settings.enabled
    ? TableNarrator.layer.pipe(
        Layer.provide(
          OpenAiLanguageModel.layer({ model: settings.model }).pipe(
            Layer.provide(
              OpenAiClient.layer({
                apiKey: Redacted.make(settings.apiKey),
                apiUrl: settings.apiUrl,
              }).pipe(Layer.provide(FetchHttpClient.layer)),
            ),
          ),
        ),
      )
    : Layer.succeed(
        TableNarrator,
        TableNarrator.of({
          narrate: () =>
            Effect.fail(new NarrationFailed({ reason: "disabled" })),
        }),
      );
