import {
  markdownTables,
  codeBlocks,
  separators,
} from "./src/replacers/index.ts";
import { Layer } from "effect";
import { SpeechCleaner } from "./src/engine/SpeechCleaner.ts";
import { narratorLayer, type ProviderSettings } from "./src/ai/Provider.ts";
import type {
  Replacer,
  NarrationFailed,
  TableNarrator,
  CodeNarrator,
  BlockClassifier,
} from "./src/index.ts";

/** Register new replacers here. Unwrap blocks before parsing tables; clean inline references last. */
export const replacers: ReadonlyArray<
  Replacer<NarrationFailed, TableNarrator | CodeNarrator | BlockClassifier>
> = [codeBlocks, markdownTables, separators];

/** Compose any new service-backed replacer's Layer here, without changing the engine. */
export const cleanerLayer = (settings: ProviderSettings) =>
  SpeechCleaner.layer(replacers).pipe(Layer.provide(narratorLayer(settings)));
