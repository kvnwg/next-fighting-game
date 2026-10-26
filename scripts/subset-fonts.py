# Makes the game's own copies of its three fonts (src/client/assets/fonts), so a build can ship them
# instead of loading them from Google Fonts (Poki allows no outside requests): Pixelify Sans and
# Silkscreen whole, DotGothic16 (a Japanese font, 1.9 MB) split in two. The first part holds what
# the game writes (Latin, kana and every kanji in the code) and loads at once; the rest of the font
# loads only if some text ever needs it, so a new kanji still shows before this is run again.
#
# Usage (with the TTFs from https://fonts.google.com, all three under the SIL Open Font Licence):
#   pip install fonttools brotli
#   python3 scripts/subset-fonts.py <folder with the .ttf files>
# It expects DotGothic16-400.ttf, PixelifySans-{400,500,600,700}.ttf and Silkscreen-{400,700}.ttf.
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'client', 'assets', 'fonts')
root = os.path.join(os.path.dirname(__file__), '..')

# what the game writes: Latin, punctuation, kana and fullwidth forms, and the kanji in its code
core = set(range(0x20, 0x7F)) | set(range(0xA0, 0x180)) | set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3100)) | set(range(0xFF00, 0xFFF0))
for d in ('src/client', 'src/shared', 'characters'):
    for dp, _, files in os.walk(os.path.join(root, d)):
        for f in files:
            if f.endswith(('.ts', '.js', '.css', '.json', '.html')):
                with open(os.path.join(dp, f), encoding='utf8') as fh:
                    core |= {ord(c) for c in fh.read() if ord(c) >= 0x2E80}


def ranges(cps):
    cps = sorted(cps)
    out, start, prev = [], None, None
    for c in cps:
        if start is None:
            start = prev = c
        elif c == prev + 1:
            prev = c
        else:
            out.append((start, prev))
            start = prev = c
    if start is not None:
        out.append((start, prev))
    return ', '.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in out)


def write(ttf, name, cps=None):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = TTFont(os.path.join(src, ttf))
    have = set(font.getBestCmap())
    keep = have if cps is None else have & cps
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=keep)
    sub.subset(font)
    path = os.path.join(out, name)
    font.flavor = 'woff2'
    font.save(path)
    print(f'{name}: {len(keep)} characters, {os.path.getsize(path) // 1024} KB')
    return keep


css = ['/* made by scripts/subset-fonts.py: the fonts index.html loads from Google Fonts, shipped with the game */']
for w in (400, 500, 600, 700):
    write(f'PixelifySans-{w}.ttf', f'pixelify-sans-{w}.woff2')
    css.append(f"@font-face {{ font-family: 'Pixelify Sans'; font-style: normal; font-weight: {w}; font-display: swap; src: url('./pixelify-sans-{w}.woff2') format('woff2'); }}")
for w in (400, 700):
    write(f'Silkscreen-{w}.ttf', f'silkscreen-{w}.woff2')
    css.append(f"@font-face {{ font-family: 'Silkscreen'; font-style: normal; font-weight: {w}; font-display: swap; src: url('./silkscreen-{w}.woff2') format('woff2'); }}")
first = write('DotGothic16-400.ttf', 'dotgothic16-core.woff2', core)
everything = set(TTFont(os.path.join(src, 'DotGothic16-400.ttf')).getBestCmap())
rest = write('DotGothic16-400.ttf', 'dotgothic16-rest.woff2', everything - first)
# the ranges don't overlap, so a browser only ever fetches the part some text needs (the rest's
# range is everything from its first character to its last but the core's, gaps and all, to keep
# it short: a character neither has just falls back to the next font)
span = set(range(min(rest), max(rest) + 1)) - core
css.append(f"@font-face {{ font-family: 'DotGothic16'; font-style: normal; font-weight: 400; font-display: swap; src: url('./dotgothic16-core.woff2') format('woff2'); unicode-range: {ranges(core)}; }}")
css.append(f"@font-face {{ font-family: 'DotGothic16'; font-style: normal; font-weight: 400; font-display: swap; src: url('./dotgothic16-rest.woff2') format('woff2'); unicode-range: {ranges(span)}; }}")
with open(os.path.join(out, 'fonts.css'), 'w', encoding='utf8') as fh:
    fh.write('\n'.join(css) + '\n')
print('wrote fonts.css')
