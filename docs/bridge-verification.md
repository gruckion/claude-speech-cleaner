# Speech bridge and final-answer verification

Verified 2026-10-08 with Claude Desktop 2.26454.2 and Bun 1.4.2 on macOS.

## Doubled typing

The maintainer reported intermittent physical keyboard input becoming doubled.
The affected draft was observed, but a native automated keypress inserted only
one character. The physical-key event sequence was not captured, so the cause
remains unproven.

The old bridge kept Electron's renderer debugger attached. The replacement uses
a per-document mailbox drained by scoped main-process work every 200 ms. It adds
no keyboard listeners. This is an experimental mitigation, not a confirmed fix
for every instance of doubled typing.

Native host checks, including three consecutive installations:

- Renderer debugger: detached after each new installation.
- Debugger message/detach listeners: zero.
- Native keyboard listeners: eight before and after; no accumulation.
- App creation listener and renderer DOM-ready listener: exactly one added while
  enabled, removed on removal, unchanged by reapplication.
- `hello` entered through five separate native automated keypresses remained
  `hello`; the test draft was cleared without sending it.

## Read Aloud

Claude Code's speech input includes progress narration from activity groups.
The selector checks structured activity/text items for the selected message and
removes only the exact matching progress prefix. The remaining original Markdown
is retained, including answer chunks not mounted in the DOM. Unknown structures
or mismatched input keep the original text.

- A regression first failed by reading progress before the answer, then passed.
- Coverage includes opened/collapsed groups, multiple answer chunks, tables,
  fenced code, wrong message IDs, mismatched content and partially rendered replies.
- Clicking Read aloud on the reported response sent its final answer first,
  excluded the reported progress sentence and received 1,197 audio frames.
- A synthetic filename request sent cleaned words and received 97 audio frames.
- Stop during a pending synthetic table request produced no speech chunks or audio.
- Switching conversations retained the active hook. Reapplication and removal
  were exercised without restarting Claude or sending chat messages.
- The temporary main-process inspector was closed after verification.

Automated mailbox coverage checks Stop before/after draining, supersession,
wrong-document and late replies, bounded pending work, and cleanup. Full-page
navigation was not driven in the live user's session; per-document identity and
cancellation are covered separately. No compatibility claim is made for future
Claude releases. Physical typing still needs the maintainer's real-world retest.
