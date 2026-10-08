# Public release audit

Audited 8 October 2026 at commit `50b5b7c333431e317183a01d3800ab61cad89fed`.
Repository: <https://github.com/gruckion/claude-speech-cleaner>.

## Original recommendation

Keep the repository private while addressing the two reproduced correctness and
installation issues below and adding CI and contributor guidance. The source is
already suitable for an explicitly experimental macOS project, but the current
experience is not ready for a broad recommendation to unfamiliar users.

The audit itself did not change repository visibility, application code,
credentials, or the active Claude patch. The follow-up below records remediation.

## Remediation in 2.0.1

- Numeric signs, ranges, and scientific notation are preserved. Only underscores
  and single hyphens between letters are separated by default.
- The CLI uses Effect's `Path.fromFileUrl` and path joining for bundle locations.
- Both regressions failed on the audited code and passed after the fixes.
- CI runs the locked Bun installation, all checks and a dependency audit on
  macOS and Linux. Actions are pinned, with a read-only token and no provider keys.
- Contributor/security policies, a code of conduct, issue/PR templates, a
  changelog and explicit experimental compatibility guidance have been added.

The findings and baseline checks below describe the original audited commit.
See GitHub Actions for the current hosted check results and the repository
Security tab for private vulnerability reporting.

## Findings

### 1. Default cleanup removes negative signs

`src/replacers/separators.ts:9` replaces every ASCII hyphen, including numeric
minus signs. Reproduced against the public pipeline API:

```text
Input:  Balance: -12 pounds. Temperature: -5 degrees.
Output: Balance:  12 pounds. Temperature:  5 degrees.
```

This is documented behavior, rather than an undisclosed implementation deviation,
but it changes the meaning of spoken information. It also affects tables when
narration fails or is disabled, and AI output that retains ASCII negative signs.
Before recommending the defaults broadly, preserve numeric signs or pronounce
them as “minus,” while continuing to separate filename words. Protect the
behavior with a pipeline regression test.

### 2. Installation fails from a checkout path containing spaces

`src/cli/main.ts:12` uses a file URL's `pathname` directly as a filesystem path.
That leaves spaces encoded as `%20`. In a fresh clone named `with spaces`,
installation and all checks passed, but `bun src/cli/main.ts apply` failed before
connecting to Claude:

```text
NotFound: FileSystem.readFile (.../with%20spaces/dist/renderer.js)
```

Decode file URLs using the platform's file-URL conversion API. Verify a checkout
with spaces and non-ASCII characters reaches the normal debugger connection
stage. The same root is used to load the desktop bundle.

### 3. Pull requests have no automated checks

There are no GitHub Actions workflows or recorded runs. GitHub reports the main
branch is unprotected. Add CI that installs the locked dependencies and runs
`bun run check` without provider secrets. Pin the supported Bun version and
make the check required when repository settings permit it.

GitHub's rulesets endpoint returned HTTP 403 because the current private
repository plan does not support that feature; no ruleset configuration was
inferred from that failed request.

### 4. Contributor and vulnerability-reporting guidance is missing

The README explains development and registering replacers, and MIT grants
reuse/modification rights. However, the repository has no `CONTRIBUTING.md`,
`SECURITY.md`, code of conduct, issue templates, or pull-request template.

Before inviting general contributions, document the contribution workflow,
supported platform/version expectations, required checks, speech-only invariant,
reproduction information, and a private vulnerability-reporting route. Templates
and a code of conduct would improve the community setup but are not prerequisites
for the code to be open source.

## Checks that passed

- GitHub is private; local HEAD matches the remote HEAD exactly.
- A fresh clone from GitHub installed with `bun install --frozen-lockfile`.
- Both the working checkout and fresh clone passed `bun run check`: formatting,
  TypeScript, eight tests with 26 assertions, and both bundles.
- `bun audit --json` returned `{}` with exit status zero: no advisories reported.
- A targeted credential and personal-path scan covered all 50 unique file blobs
  reachable through the repository's three commits. It found no matching secrets
  or machine-specific user paths. This was a pattern scan, not a comprehensive
  security assessment. No credentials or private environment files are tracked.
- The local provider `.env` is ignored by Git and has mode `0600`.
- The repository has an MIT license; the 53 production dependency entries
  reported by `bun pm licenses --prod` were MIT licensed.
- The README clearly identifies the unsupported runtime modification, explains
  installation/removal/reapplication, discloses external table processing, and
  distinguishes Mac speech from the unaffected native iPhone app.

## Test and compatibility limits

The baseline tests exercise meaningful pipeline, provider-contract, Markdown, and speech
cancellation behavior. At the time of the audit, automated coverage did not exercise the CLI's
installation path handling (now covered), module discovery, main-process inspector lifecycle,
or Electron navigation/detachment behavior. Earlier manual verification covers
some of these paths but does not provide repeatable regression protection.

The four-second table-rule deadline is shared by all tables in a response, whose
provider calls are sequential. Larger or multiple tables can fall back to the
original table text even when the provider works. Make this behavior explicit
and assess its usability before describing table narration as reliable across
arbitrary responses.

The actual Claude adapter was previously verified on Desktop 2.26454.2. Earlier
in this conversation, the configured OpenAI Luna request and table preview
succeeded. This audit did not repeat audible playback or test another person's
Mac, another Claude version, or native iPhone speech.

At the time of the audit there were no release tags or GitHub releases. Consider a clearly labelled
experimental release and a short changelog after the fixes. `private: true` in
`package.json` only prevents npm publication; it does not prevent a public GitHub
source release. Git commit author names and email addresses will become public
with the history.
