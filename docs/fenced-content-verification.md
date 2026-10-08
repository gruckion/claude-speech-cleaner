# Fenced-content routing verification

8 October 2026, Effect 4.0.1, Bun 1.4.2, Claude Desktop 2.26454.2.

## Bugs and repair

The old separator classifier explicitly rejected bare identifiers, so a function
name such as `enqueue_route_optimizations_after_commit` kept its underscores.
The inline-code rule now includes snake_case identifiers; command strings,
flags, negative numbers and prose outside inline code remain outside its scope.

Every Markdown code node previously went straight to the narrator, including
prose fenced for copying. That rule also unconditionally added “Code summary:”.
The reported live playback itself was not captured, so we cannot reconstruct
which response led to the label-only audio. The repair removes the added label,
reads prose directly and rejects empty/placeholder narration. Nested fences and
model-generated fences are unwrapped before Claude's own cleanup can discard
contents. This changes only the speech input.

## Routing and fallback

Jev gets one request containing block source and two questions per block: Choice
for prose/code/data/mixed, and Noul for natural-language readability. Only strong
agreement for code/data leads to narration. Uncertain, failed, missing or invalid
classification preserves the words with fences removed. No classifier means
verbatim block reading, not automatic transmission to another provider.

Classification has a 1.5-second deadline; classification plus narration has a
3.5-second deadline within the engine's existing four-second rule budget. This
leaves narration more time when classification finishes quickly. A total deadline
restores every block's readable contents. An individual narrator failure restores
only that block. No persistent cache or conversation logging is introduced.

## Evidence and limits

- Regression tests failed on the old behavior for snake_case function names and
  placeholder-only narration, then passed after the repair.
- Synthetic local HTTP tests exercise the real Effect Jev and narration clients:
  block-only payloads, provider separation, opt-ins, truncated output, missing
  answers, disagreement and HTTP failure. Rule tests cover nested fences and
  both classifier and narration timeouts.
- A six-case live `jev-latest` probe covered mislabeled prose, numbered prose,
  prose with identifiers, a typed function, a shell loop and mixed prose/code.
  The first question wording conservatively read the shell loop in the batch;
  clearer natural-language criteria routed all six as expected in 250 ms. These
  are development examples, not a held-out accuracy benchmark or latency guarantee.
- Live Luna narration of a synthetic function still produced an explanation.
  A live fenced-prose preview retained both lists and cleaned the function names.
- Passing that preview through the pure Markdown cleaner extracted from the
  captured Claude loader preserved all draft text and produced spaced function
  names, with neither a code-block placeholder nor a code-summary label. This
  verifies the captured cleanup path, not audible playback or future Claude builds.
