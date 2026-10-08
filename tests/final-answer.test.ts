import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { selectFinalAnswer } from "../src/claude/FinalAnswer.ts";

// The DOM and item props are the adapter's foreign Claude boundary. Synthetic
// Markdown keeps this independent of private conversations and minified names.
test("Read Aloud selects the answer after activity, preserving Markdown and other messages", () => {
  const { document } = parseHTML(`<html><body>
    <div data-testid="assistant-message" data-turn-key="other"><div data-cds="TurnStatus"></div><div data-transcript-engine-root data-item-key="other:t1"></div></div>
    <div data-testid="assistant-message" data-turn-key="answer">
      <div data-cds="TurnStatus" data-item-key="answer:g1" data-closed><div data-transcript-engine-root data-item-key="answer:t1"></div></div>
      <div data-transcript-engine-root data-item-key="answer:t2"></div>
      <div data-cds="TurnStatus" data-item-key="answer:g2" data-closed></div>
      <div data-transcript-engine-root data-item-key="answer:t3"></div>
      <div data-transcript-engine-root data-item-key="answer:t4"></div>
    </div></body></html>`);
  const prose = [
    "Checking reports.",
    "Still checking.",
    "**Yes, partly.** Reports have expandable rows.\n\n| Column | Value |\n| --- | --- |\n| a | 1 |",
    "```ts\nconst file_name = 'report-table.tsx';\n```",
  ];
  for (const [index, element] of [
    ...document.querySelectorAll(
      '[data-turn-key="answer"] [data-transcript-engine-root]',
    ),
  ].entries()) {
    Object.assign(element, {
      __reactFiber$fixture: {
        memoizedProps: {},
        return: {
          memoizedProps: {
            item: {
              kind: "text",
              format: "markdown",
              key: `answer:t${index + 1}`,
              text: prose[index],
            },
          },
        },
      },
    });
  }
  for (const [index, element] of [
    ...document.querySelectorAll(
      '[data-turn-key="answer"] [data-cds="TurnStatus"]',
    ),
  ].entries()) {
    Object.assign(element, {
      __reactFiber$fixture: {
        memoizedProps: {
          group: {
            kind: "activity",
            key: `answer:g${index + 1}`,
            steps:
              index === 0
                ? [
                    {
                      kind: "narration",
                      format: "markdown",
                      key: "answer:t1",
                      text: prose[0],
                    },
                    { kind: "tool" },
                  ]
                : [{ kind: "tool" }],
          },
        },
      },
    });
  }
  const previous = globalThis.document;
  Object.assign(globalThis, { document });
  try {
    const raw = prose.join("\n\n");
    expect(selectFinalAnswer("answer", raw)).toBe(prose.slice(2).join("\n\n"));
    document
      .querySelector('[data-cds="TurnStatus"][data-closed]')
      ?.removeAttribute("data-closed");
    expect(selectFinalAnswer("answer", raw)).toBe(prose.slice(2).join("\n\n"));
    expect(selectFinalAnswer("missing", raw)).toBe(raw);
    expect(selectFinalAnswer("answer", "Different content")).toBe(
      "Different content",
    );
    expect(selectFinalAnswer("other", raw)).toBe(raw);
    expect(raw).toBe(prose.join("\n\n"));
    document.querySelector('[data-item-key="answer:t3"]')?.remove();
    expect(selectFinalAnswer("answer", raw)).toBe(prose.slice(2).join("\n\n")); // Missing first answer chunk still retains the complete original answer.
    document.querySelector('[data-item-key="answer:t4"]')?.remove();
    expect(selectFinalAnswer("answer", raw)).toBe(raw); // No rendered answer.
  } finally {
    Object.assign(globalThis, { document: previous });
  }
});
