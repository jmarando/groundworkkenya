// Runs the Python unit tests for the atlas scripts (scripts/atlas/test_*.py) as part of
// `npm test`. Skips, as the SQL tests do, when there is no python3. ATLAS_PYTHON names another
// interpreter (empty counts as unset): the ward population test needs one with rasterio and numpy
// installed, and skips itself without. Fails if no test ran at all, so a stand-in that exits 0
// cannot pass, and reports how many ran. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-scripts.test.ts

import { spawnSync } from "node:child_process";

const python = process.env["ATLAS_PYTHON"] || "python3";
const probe = spawnSync(python, ["--version"], { encoding: "utf8" });
if (probe.error) {
  console.log(`SKIP: ${python} not found. Install Python 3 to run the atlas script tests.`);
  process.exit(0);
}

const run = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "scripts/atlas", "-p", "test_*.py"],
  { encoding: "utf8" },
);
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);

// unittest ends its stderr with "Ran 18 tests in 0.3s". Exit 0 without that line, or with
// "Ran 0 tests", means nothing was tested, and that must not pass.
const summary = /^Ran (\d+) tests?/m.exec(run.stderr);
const count = summary ? Number(summary[1]) : 0;
if (run.status === 0 && count === 0) {
  console.log("atlas script tests failed: no test ran");
  process.exit(1);
}
console.log(
  run.status === 0 ? `atlas script tests passed (${count} tests)` : "atlas script tests failed",
);
process.exit(run.status ?? 1);
