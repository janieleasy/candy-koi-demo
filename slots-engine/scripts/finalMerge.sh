#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for g in A B; do for m in normal buy; do node --import tsx scripts/merge.ts $g $m final > /dev/null; echo "merged $g $m"; done; done
