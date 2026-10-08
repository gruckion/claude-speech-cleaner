import { Schema } from "effect";

export const controlName = "__claudeSpeechCleaner";
export const Text = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(100_000)),
);
export const Request = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("replace"),
    id: Schema.String,
    text: Text,
  }),
  Schema.Struct({ kind: Schema.Literal("cancel"), id: Schema.String }),
]);
export type Request = typeof Request.Type;
export const Mailbox = Schema.Struct({
  instance: Schema.String,
  requests: Schema.Array(Request).pipe(Schema.check(Schema.isMaxLength(16))),
});
export const Reply = Schema.Struct({
  id: Schema.String,
  text: Text,
  applied: Schema.Boolean,
  changes: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.String),
});
export type Reply = typeof Reply.Type;

export class ClaudeError extends Schema.TaggedError<ClaudeError>()(
  "ClaudeError",
  {
    message: Schema.String,
  },
) {}
