import { Schema } from "effect";

const TextItem = Schema.Struct({
  kind: Schema.Literals(["text", "narration"]),
  format: Schema.Literal("markdown"),
  key: Schema.String,
  text: Schema.String,
});
const Activity = Schema.Struct({
  kind: Schema.Literal("activity"),
  key: Schema.String,
  steps: Schema.Array(
    Schema.Union([
      TextItem,
      Schema.Struct({ kind: Schema.Literals(["tool", "thinking"]) }),
    ]),
  ),
});
const ItemProps = Schema.Struct({ item: TextItem });
const GroupProps = Schema.Struct({ group: Activity });
interface ClaudeFiber {
  memoizedProps?: unknown;
  return?: ClaudeFiber;
}

/** Read only the Markdown owned by this transcript item or activity group. */
function progressText(element: Element): ReadonlyArray<string> | undefined {
  const key = Object.keys(element).find((key) =>
    key.startsWith("__reactFiber$"),
  );
  if (!key) return;
  let fiber = (element as unknown as Record<string, ClaudeFiber>)[key];
  const activity = element.getAttribute("data-cds") === "TurnStatus";
  for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
    if (activity) {
      const props = Schema.decodeUnknownOption(GroupProps)(fiber.memoizedProps);
      if (
        props._tag === "Some" &&
        props.value.group.key === element.getAttribute("data-item-key")
      )
        return props.value.group.steps.flatMap((step) =>
          "text" in step ? [step.text] : [],
        );
    } else {
      const props = Schema.decodeUnknownOption(ItemProps)(fiber.memoizedProps);
      if (
        props._tag === "Some" &&
        props.value.item.key === element.getAttribute("data-item-key")
      )
        return [props.value.item.text];
    }
  }
}

/** Remove only a verified activity/progress prefix. The answer itself stays in
 * the original speech input, so partially rendered replies cannot truncate it. */
export function selectFinalAnswer(messageId: string, original: string): string {
  const rows = [
    ...document.querySelectorAll(
      '[data-testid="assistant-message"][data-turn-key]',
    ),
  ].filter((row) => row.getAttribute("data-turn-key") === messageId);
  if (rows.length !== 1) return original;
  const row = rows[0]!;
  const items = [
    ...row.querySelectorAll(
      '[data-cds="TurnStatus"], [data-transcript-engine-root][data-item-key]',
    ),
  ].filter(
    (element) =>
      element.closest('[data-testid="assistant-message"]') === row &&
      !element.parentElement?.closest('[data-cds="TurnStatus"]'),
  );
  const lastActivity = items.findLastIndex(
    (element) => element.getAttribute("data-cds") === "TurnStatus",
  );
  if (lastActivity < 0 || lastActivity === items.length - 1) return original;
  let remaining = original.trimStart();
  for (const item of items.slice(0, lastActivity + 1)) {
    const texts = progressText(item);
    if (!texts) return original;
    for (const text of texts) {
      const prefix = text.trim();
      if (!prefix) continue;
      if (!remaining.startsWith(prefix)) return original;
      const after = remaining.slice(prefix.length);
      if (after && !/^\s/.test(after)) return original;
      remaining = after.trimStart();
    }
  }
  return remaining.trim() ? remaining : original;
}
