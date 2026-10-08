import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));

async function runCli(checkout: string, command: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      join(project, "tests/fixtures/offline-inspector.ts"),
      join(checkout, "src/cli/main.ts"),
      command,
    ],
    {
      cwd: checkout,
      env: { ...process.env, SPEECH_AI_ENABLED: "false", NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("unavailable debugger gives recovery steps without a stack trace or a success exit", async () => {
  for (const command of ["remove", "status"]) {
    const { stdout, stderr, exit } = await runCli(project, command);
    expect(exit).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Developer → Enable Main Process Debugger");
    expect(stderr).toContain(`bun run ${command}`);
    expect(stderr).toContain("No changes were made");
    expect(stderr).not.toMatch(
      /\n\s+at |ERROR \(#|ClaudeError:|DebuggerUnavailable:/,
    );
  }
});

test("apply finds its bundles in checkout paths containing spaces and Unicode", async () => {
  const checkout = await mkdtemp(join(tmpdir(), "speech cleaner-é-"));
  try {
    await cp(join(project, "src"), join(checkout, "src"), { recursive: true });
    await cp(
      join(project, "speech.config.ts"),
      join(checkout, "speech.config.ts"),
    );
    await symlink(
      join(project, "node_modules"),
      join(checkout, "node_modules"),
      "dir",
    );
    const renderer = join(checkout, "dist", "renderer.js");
    await mkdir(dirname(renderer));
    await writeFile(
      renderer,
      "// Synthetic bundle: never injected into Claude.\n",
    );
    const { stdout, stderr, exit } = await runCli(checkout, "apply");
    // Reaching the debugger instruction proves bundle loading succeeded. The
    // preload supplies no targets, so this cannot touch a user's running app.
    expect(exit).toBe(1);
    expect(stdout + stderr).toContain(
      "Developer → Enable Main Process Debugger",
    );
    expect(stderr).toContain("bun run apply");
    expect(stderr).not.toMatch(/\n\s+at |ERROR \(#|ClaudeError:/);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});
