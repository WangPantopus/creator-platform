# Builds contact sheets: phone boards three across, desktop boards one per sheet, each labelled.
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
theme = sys.argv[1]; canvases = sys.argv[2].split(','); out = sys.argv[3]
os.makedirs(out, exist_ok=True)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
except Exception: font = ImageFont.load_default()
for c in canvases:
    idx = json.load(open(f'{c}/project/canvas.json'))
    phones, desks = [], []
    for b in idx['order']:
        p = f'shots/{c}/{b[:-8]}.{theme}.png'
        if not os.path.exists(p): continue
        (phones if idx['boards'][b]['w'] <= 400 else desks).append((b, p))
    groups = [phones[i:i+3] for i in range(0, len(phones), 3)] + [[d] for d in desks]
    for gi, g in enumerate(groups):
        ims = [Image.open(p) for _, p in g]
        W = sum(i.width for i in ims) + 24 * (len(ims) + 1); H = max(i.height for i in ims) + 60
        sheet = Image.new('RGB', (W, H), (120, 120, 120))
        d = ImageDraw.Draw(sheet); x = 24
        for (b, _), im in zip(g, ims):
            d.text((x, 18), b[:-8], fill=(255, 255, 255), font=font)
            sheet.paste(im, (x, 48)); x += im.width + 24
        sheet.save(f'{out}/{c}.{theme}.{gi:02d}.png')
print('ok')
