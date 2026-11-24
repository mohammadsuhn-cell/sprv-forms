// Synthetic model transitions and real component rendering; no browser or live data.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "tests/form-workspace.test.mjs",
    "tests/form-workspace-ui.test.mjs",
  ],
  { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
