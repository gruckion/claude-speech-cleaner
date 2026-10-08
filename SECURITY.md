# Security policy

## Report a vulnerability privately

Use GitHub's [Report a vulnerability form](https://github.com/gruckion/claude-speech-cleaner/security/advisories/new).
Do not open a public issue for credential exposure, unauthorized data access or
other exploitable vulnerabilities. Include affected versions, impact and a
minimal reproduction using synthetic data. Never include working API keys or
private conversations. If a key has been exposed, revoke it with its provider.

The latest `main` and latest release are the supported targets for fixes.
There is no response-time guarantee or long-term support for older releases.

## Access and data flow

This is an unofficial runtime modification, not a supported Anthropic extension.
It temporarily uses Claude's main-process debugger to install a hook, verifies
the local process, then closes that inspector. A renderer debugger attachment
remains while the hook is enabled. Do not expose debugger ports to a network.

The API key is loaded from local configuration into the CLI and Claude's main
process. It is not sent to the renderer or included in status output. Keep `.env`
private, use `chmod 600 .env`, and never commit it. Your configured provider
receives the recognized Markdown tables when AI narration is enabled. The
block-classification opt-in sends recognized fenced/indented blocks to Jev
(TypeSafe), including fenced prose, comments and string literals. Blocks selected
for explanation then go to the configured narration provider. All three settings
`SPEECH_AI_ENABLED`, `SPEECH_AI_CODE_ENABLED` and `SPEECH_CLASSIFIER_ENABLED` must
be true for classification. Without the classifier, enabled block handling reads
contents locally with fences removed. Neither rule sends surrounding conversation
text. Source may contain secrets: leave these options disabled for material you
do not want sent. Each provider's privacy, retention and billing policies apply.

Only install replacers and provider code that you trust: they execute with your
local process permissions. This registry is an extension API, not a sandbox.
AI narration can be inaccurate; timeout and provider failures fall back to the
existing text. Neither fallback nor a successful test guarantees fidelity for
all messages.

Quit Claude to remove the in-memory hook, or follow the README's removal steps.
If cleanup reports that it cannot close the debugger, disable it in Claude's
Developer menu or quit Claude.
