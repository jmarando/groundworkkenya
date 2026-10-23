#!/usr/bin/env bash
# Runs every tests/*.test.ts and reports every failure (not just the first), then the SQL tests.
#
#   npm test
set -uo pipefail
cd "$(dirname "$0")/.."

tsx=node_modules/.bin/tsx
if [ ! -x "$tsx" ]; then
  echo "FAIL: $tsx not found. Install dependencies first."
  exit 1
fi

failed=()
for t in tests/*.test.ts; do
  if ! out="$("$tsx" --tsconfig tsconfig.json "$t" 2>&1)"; then
    failed+=("$t")
    echo "FAIL $t"
    echo "$out" | tail -20
  fi
done
total=$(ls tests/*.test.ts | wc -l | tr -d ' ')
echo "$((total - ${#failed[@]})) of $total TypeScript test files passed"

sql=0
bash tests/sql/run.sh || sql=1

if [ ${#failed[@]} -gt 0 ] || [ $sql -ne 0 ]; then
  exit 1
fi
