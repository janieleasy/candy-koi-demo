#!/usr/bin/env python3
"""从 /workspace/slots-ui/assets 复制 symbols/ 与 ui/ 的素材到 public/assets/(只读源,不改动)。

默认(ASSET_FORMAT=webp):@2x PNG / 合图 / 背景 转为 WebP(lossy q=88,带 alpha)以压首包体积,
并改写**副本**里的 manifest 与 sheet json 指向 .webp。
ASSET_FORMAT=png:原样复制 png + json,不转码(体积大,约 7 MB)。
paytable 不复制(UI 正在更新赔付表页面)。
用法: python3 scripts/copy-assets.py [--src /workspace/slots-ui/assets]
"""
import json, os, shutil, sys
from PIL import Image

SRC = '/workspace/slots-ui/assets'
if '--src' in sys.argv: SRC = sys.argv[sys.argv.index('--src') + 1]
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
FMT = os.environ.get('ASSET_FORMAT', 'webp')
Q = int(os.environ.get('WEBP_QUALITY', '80'))

shutil.rmtree(DST, ignore_errors=True)
os.makedirs(os.path.join(DST, 'symbols'), exist_ok=True)
os.makedirs(os.path.join(DST, 'ui/png'), exist_ok=True)
os.makedirs(os.path.join(DST, 'ui/counters/png'), exist_ok=True)

def conv(src, dst_noext, q=None, method=4):
    if FMT == 'png':
        shutil.copy(src, dst_noext + '.png'); return '.png'
    Image.open(src).convert('RGBA').save(dst_noext + '.webp', 'WEBP', quality=Q if q is None else q, method=method)
    return '.webp'

ext = '.png' if FMT == 'png' else '.webp'
# symbols
sheet = json.load(open(f'{SRC}/symbols/symbols-sheet.json'))
# 符号合图是最大单文件:method=6 + q=SHEET_Q(默认 78),比 q80/method4 省约 8%(PSNR 约 -0.5dB,肉眼无差)
conv(f'{SRC}/symbols/symbols-sheet.png', f'{DST}/symbols/symbols-sheet', q=int(os.environ.get('SHEET_QUALITY', '78')), method=6)
sheet['meta']['image'] = 'symbols-sheet' + ext
json.dump(sheet, open(f'{DST}/symbols/symbols-sheet.json', 'w'), separators=(',', ':'))
# atlas.json:副本里把旧称「锦鲤珍珠」统一为「彩虹珍珠」(D-04;源文件在 slots-ui,只读不改)
RENAMES = [('W 锦鲤珍珠 Wild', 'W 彩虹珍珠 Wild'), ('锦鲤珍珠', '彩虹珍珠')]
atlas = open(f'{SRC}/symbols/atlas.json', encoding='utf-8').read()
for a, b in RENAMES: atlas = atlas.replace(a, b)
open(f'{DST}/symbols/atlas.json', 'w', encoding='utf-8').write(atlas)

# ui:只拷贝 manifest 里引用到的 png / png2x
man = json.load(open(f'{SRC}/ui/ui-manifest.json'))
out = {}
# 设计说明面板素材:入口按钮 normal/pressed + 首次提示气泡(disabled 不用);panel-A/B(-scrolled)/wireframe 是 1080×1920 稿面参考图,运行时不用,不复制。
DN_SKIP = ('design-notes/panel-', 'design-notes/btn-design-notes_disabled')
SKIP_EXACT = ('logo',)  # 通用无副标版不用;按玩法用 logo-A / logo-B(D-03)
for k, v in man.items():
    if k.startswith(DN_SKIP) or k in SKIP_EXACT: continue
    v = dict(v); v.pop('svg', None)
    for f in ('png', 'png2x'):
        if v.get(f):
            p = v[f]; base = os.path.splitext(p)[0]
            os.makedirs(os.path.dirname(f'{DST}/{base}'), exist_ok=True)
            v[f] = base + conv(f'{SRC}/{p}', f'{DST}/{base}')
    out[k] = v
json.dump(out, open(f'{DST}/ui/ui-manifest.json', 'w'), ensure_ascii=False, indent=1)

# 大赢演出素材(slots-ui/assets/bigwin,只读源):**原样复制**,不重新编码(不降画质);全部由 three 块按档位懒加载,绝不进首屏
BW_SRC, BW_DST = f'{SRC}/bigwin', f'{DST}/bigwin'
if os.path.isdir(BW_SRC):
    os.makedirs(BW_DST, exist_ok=True)
    for f in ['particles-atlas.webp', 'particles-atlas.json', 'noise-256.png', 'hero-koi.webp',
              'ramp-big.png', 'ramp-mega.png', 'ramp-super.png',
              'title-big.webp', 'title-mega.webp', 'title-super.webp', 'title-big.png', 'title-mega.png', 'title-super.png']:
        shutil.copy(f'{BW_SRC}/{f}', f'{BW_DST}/{f}')
    shutil.copy(f'{BW_SRC}/sprites/ray.png', f'{BW_DST}/ray.png')
    # 矢量源:主视觉锦鲤 / 皇冠按需光栅化到更高分辨率(比 512×384 位图锐利);位图版作兜底
    shutil.copy(f'{BW_SRC}/sprites/hero-koi.svg', f'{BW_DST}/hero-koi.svg')
    shutil.copy(f'{BW_SRC}/sprites/crown.svg', f'{BW_DST}/crown.svg')

tot = 0
for r, _, fs in os.walk(DST):
    for f in fs: tot += os.path.getsize(os.path.join(r, f))
print(f'format={FMT} total={tot/1024:.0f} KB -> {os.path.normpath(DST)}')
