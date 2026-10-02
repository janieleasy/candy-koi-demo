/** 打印 config 的轴带构成与币值权重(供 PAYTABLE_CHANGES.md 引用)。 */
import { configA } from '../config/gameA.js';
import { configB } from '../config/gameB.js';
const fmt = (x: number) => (x * 100).toFixed(2) + '%';
for (const set of ['base', 'fs'] as const) {
  const st = configA.reels[set] as string[][];
  const tot = st.reduce((a, s) => a + s.length, 0);
  const c = (f: (s: string) => boolean) => st.reduce((a, s) => a + s.filter(f).length, 0);
  console.log(set, 'len', st.map(s => s.length).join('/'), 'W', c(s => s === 'W'), fmt(c(s => s === 'W') / tot), '低', c(s => s[0] === 'L'), fmt(c(s => s[0] === 'L') / tot), '高', c(s => s[0] === 'H'), fmt(c(s => s[0] === 'H') / tot), 'S', c(s => s === 'S'), fmt(c(s => s === 'S') / tot), 'Wper', st.map(s => s.filter(x => x === 'W').length).join('/'));
}
const B = configB;
const sw = B.coin.startWeights, rw = B.coin.respinWeights, v = B.coin.values;
const ts = sw.reduce((a, b) => a + b, 0), tr = rw.reduce((a, b) => a + b, 0);
console.log('start', v.map((x, i) => x + ':' + sw[i] + '(' + fmt(sw[i] / ts) + ')').join(' '));
console.log('resp', v.map((x, i) => x + ':' + rw[i] + '(' + fmt(rw[i] / tr) + ')').join(' '));
console.log('jp', JSON.stringify(B.coin.jackpotWeights), 'q', B.coin.jackpotProb);
console.log('C per reel', (B.reels.base as string[][]).map(s => s.length + ':' + s.filter(x => x === 'C').length).join(' '));
console.log('pRespin', B.pRespin.map((p, i) => 'K' + (6 + i) + '=' + p).join(' '));
