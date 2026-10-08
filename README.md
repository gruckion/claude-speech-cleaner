# Claude speech cleaner

A local Mac patch that replaces ASCII hyphens and underscores with spaces
**only in the text sent to Claude Read aloud**. It leaves the displayed
conversation, generated code, clipboard and files untouched.

**Installed and tested on Claude Desktop 2.26454.0 on 8 October 2026.**
The real Read aloud button sent cleaned text, received audio, and played it.
Manual testing confirmed correct pronunciation and normal keyboard input. This is a local modification,
not an official Claude plugin or an Anthropic-supported integration.

## Setup

Requirements: macOS, Claude Desktop installed at `/Applications/Claude.app`,
[Bun](https://bun.sh), and Git. There are no package dependencies to install.

```sh
git clone https://github.com/gruckion/claude-speech-cleaner.git
cd claude-speech-cleaner
```

In Claude, choose **Help → Troubleshooting → Enable Developer Mode** once.
This restarts Claude, so finish active work first. Developer mode is a user
setting that normally survives app updates.

## Enable or reapply after restarting Claude

The patch survives switching conversations and reloading the conversation
interface. **It does not survive quitting/restarting the entire Claude app.**
Claude's installed files and signature are unchanged.

1. Open Claude Desktop and a conversation.
2. Double-click `reapply.command` in this folder.
3. In Claude, choose **Developer → Enable Main Process Debugger**.

The command waits up to two minutes for that menu action, installs the patch,
reports its status, and closes the temporary debugger. You do not need to quit
Claude to reapply. Repeating the command replaces the previous installation
without accumulating duplicate hooks.

From a terminal, the equivalent is:

```sh
bun run apply
```

## Check it after an update

After reapplying, use Read aloud on a response containing a name such as
`my_project/release-notes.md`. Then enable the main-process debugger again and
run:

```sh
bun run status
```

`active: true` means the wrapper is installed. A nonzero `changedFrames` means
it has rewritten an actual speech request since the current page loaded.
Zero before using Read aloud is normal. If it remains zero after reading text
containing a hyphen or underscore, Claude may have changed its speech protocol;
the patch needs another audit. Installation alone does not prove a new app
version remains compatible. Reloading the page resets renderer counters.

`injections` counts successful renderer installations during this app run.
No message text is retained in status or logs.

## Remove

Enable **Developer → Enable Main Process Debugger**, then run:

```sh
bun run remove
```

This removes the page-load hooks and restores the original WebSocket sender.
Quitting Claude also removes the runtime patch. Reloading a page does not,
because the installed loader re-applies it. If another script has wrapped the
sender after this patch, removal reports `removed: false`; quit and reopen
Claude to clear runtime modifications without overwriting that other script.

The only persistent Claude setting changed by setup is `allowDevTools: true`
in `~/Library/Application Support/Claude/developer_settings.json`. This keeps
the Developer menu available; it does not keep a debugger port open. To undo
that setup too, set it to false (preserving other settings) and restart Claude.

## Exact changes

- `renderer.js` wraps `WebSocket.prototype.send`. It changes only string JSON
  `text_chunk` frames sent to the exact same-host endpoint
  `/api/ws/text_to_speech/text_stream`, using
  `frame.text.replace(/[-_]+/g, " ")`.
- `desktop.mjs` installs that script into the `https://claude.ai` renderer,
  watches for new web contents and `dom-ready`, and provides status/removal.
- `cli.mjs` connects temporarily to Claude's own Node inspector on loopback
  port 9229. It verifies the listening PID and executable before installing,
  then verifies the debugger closed. It does not modify `app.asar`, re-sign
  Claude, install certificates, or change the CLI engine.
- `reapply.command` provides the double-click entry point.

The wrapper copies a speech frame; it never edits the original assistant
message. Other JSON fields, non-speech messages, unrelated endpoints, binary
frames and malformed JSON pass through unchanged.

The replacement is literal: it also removes ASCII hyphens in negative numbers
and command flags from speech. Those characters remain intact on screen and
in files. Unicode dashes are unchanged.

## Desktop and phone

This changes Read aloud **when pressed on the Mac**, including conversations
with Remote Control enabled. It does not change Read aloud in the native iPhone app, even when
that phone is controlling a session hosted on the Mac: the phone owns its
speech request.

## Verification

- Real Desktop button: receiver-side network observation confirmed the exact
  cleaned `text_chunk` and hundreds of incoming audio frames. Original
  punctuation remained visible; user confirmed correct speech.
- Removed patch: the same real button sent original punctuation again.
- Reapplied patch and reloaded: loader remained active, injection count rose
  from one to two, with zero reported injection failures.
- `bun test`: real loopback WebSocket receiver checks 16 assertions covering
  replacement, metadata, endpoint/hostname isolation, control and binary
  frames, malformed data, duplicate installation, and undo. A temporary copy
  with replacement disabled failed on the expected text mismatch.

The earlier audit traced Anthropic's
[Read aloud engine](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cb17312fe-B2ml4MUo.js)
and [same-origin speech transport](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6f15305a-B18LsM8F.js).
Claude Code's `audio.speak` mod API uses system speech and does not intercept
this built-in renderer path.

## Development and contributions

```sh
bun test
```

The automated test uses a local WebSocket receiver and does not connect to
Claude or change a running app. To check an app update, also perform the manual
Read aloud and removal checks above. Include the Claude version, macOS version,
and sanitized status output when reporting a compatibility issue. Do not share
conversation contents or debugger URLs.

Small, focused pull requests are welcome. Changes should preserve the boundary
between speech requests and ordinary conversation traffic, as well as clean
removal and repeatable installation.

## License

[MIT](LICENSE). This project is independent of Anthropic.
