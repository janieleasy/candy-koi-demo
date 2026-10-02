#!/usr/bin/env bash
# 并行 shard 模拟。用法: scripts/runSim.sh <A|B> <normal|buy> <totalSpins> <shards> <seedPrefix> [batchesPerShard=25]
# 原始结果: sim/raw/<game>_<mode>_<seedPrefix>_<i>.json ; 合并: node --import tsx scripts/merge.ts <game> <mode> <seedPrefix>
set -euo pipefail
cd "$(dirname "$0")/.."
G=$1; M=$2; TOTAL=$3; SH=$4; PFX=$5; NB=${6:-25}
mkdir -p sim/raw
PER=$(( TOTAL / SH ))
for i in $(seq 1 "$SH"); do
  node --import tsx scripts/sim.ts "$G" "$M" "$PER" "$NB" "${PFX}-${G}-${M}-${i}" "sim/raw/${G}_${M}_${PFX}_${i}.json" &
done
wait
