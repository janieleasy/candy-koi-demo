#!/usr/bin/env bash
# 最终模拟(固定 seed 前缀 "final")。复现: bash scripts/finalSim.sh  然后 bash scripts/finalMerge.sh
# A: 正常 2e8 局, 购买 2e7 次; B: 正常 4e8 局, 购买 4e7 次。每个 shard 25 批, 批结果落盘 sim/raw/。
set -euo pipefail
cd "$(dirname "$0")/.."
S=${SHARDS:-8}
scripts/runSim.sh A normal 200000000 $S final 25
scripts/runSim.sh A buy     20000000 $S final 25
scripts/runSim.sh B normal 400000000 $S final 25
scripts/runSim.sh B buy     40000000 $S final 25
