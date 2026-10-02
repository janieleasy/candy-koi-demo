#!/usr/bin/env bash
# 并行跑全部蒙特卡洛并合并到 report/data。用法: bash scripts/runSims.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p /tmp/sim report/data
run() { # game mode perProc procs
  local g=$1 m=$2 n=$3 p=$4
  for i in $(seq 1 $p); do node --import tsx scripts/sim.ts $g $n ${g}${m}$i $m /tmp/sim/${g}_${m}_$i.json & done
  wait
  node --import tsx scripts/merge.ts report/data/sim_${g}_${m}.json /tmp/sim/${g}_${m}_*.json > /dev/null
}
rm -f /tmp/sim/*.json
run A normal 25000000 8
run A buy 5000000 8
run B normal 25000000 8
run B buy 5000000 8
echo done
