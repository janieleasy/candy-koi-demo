# 实现截图(1080w)与 UI 稿并排:左稿右实现 → screenshots/compare-panel-{A,B}[-scrolled].png
from PIL import Image, ImageDraw
D = '/workspace/slots-ui/assets/design-notes/'; O = '/workspace/slots-app/screenshots/'
for g in 'AB':
    for suf in ('', '-scrolled'):
        ref = Image.open(f'{D}panel-{g}{suf}.png').convert('RGB')
        im = Image.open(f'{O}design-panel-{g}-1080w{suf}.png').convert('RGB').resize(ref.size)
        w, h = ref.size; s = 0.5
        out = Image.new('RGB', (int(w * s) * 2 + 30, int(h * s) + 40), (30, 30, 30))
        out.paste(ref.resize((int(w * s), int(h * s))), (10, 30)); out.paste(im.resize((int(w * s), int(h * s))), (int(w * s) + 20, 30))
        d = ImageDraw.Draw(out); d.text((12, 8), f'UI panel-{g}{suf}.png (left)', fill=(255, 255, 255)); d.text((int(w * s) + 22, 8), 'impl 1080w (right)', fill=(255, 255, 255))
        out.save(f'{O}compare-panel-{g}{suf}.png')
