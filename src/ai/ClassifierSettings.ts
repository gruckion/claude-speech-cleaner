import { Schema } from "effect";

export const ClassifierSettings = Schema.Struct({
  apiKey: Schema.String,
  model: Schema.String,
  apiUrl: Schema.String,
});
