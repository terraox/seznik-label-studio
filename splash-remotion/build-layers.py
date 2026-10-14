"""Splits ../assets/images/logo.png into flat layers for the Remotion splash.

  public/printer-body.png  flat navy printer body (lid + side), alpha taken from the logo's antialiasing
  public/swoosh.png        the logo with the printer body blanked out (swoosh, label, wordmark)

Needs ffmpeg. Run: python3 build-layers.py
"""
import os, subprocess, tempfile
from collections import deque

W = H = 1254
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, '..', 'assets', 'images', 'logo.png')
NAVY = (17, 39, 90)
BG = (254, 254, 254)

tmp = tempfile.mkdtemp()
raw = os.path.join(tmp, 'logo.raw')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', LOGO, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], check=True)
d = open(raw, 'rb').read()


def is_navy(i):
    r, g, b = d[i * 3], d[i * 3 + 1], d[i * 3 + 2]
    return r < 90 and g < 110 and b < 150 and b > g + 25


def flood(seed, ok):
    seen = bytearray(W * H)
    q = deque([seed]); seen[seed] = 1
    while q:
        p = q.popleft(); x, y = p % W, p // W
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                j = ny * W + nx
                if not seen[j] and ok(j):
                    seen[j] = 1; q.append(j)
    return seen


# Printer body = the two navy pieces (lid, side face) of the logo.
body = bytearray(W * H)
for sx, sy in ((700, 450), (520, 560)):
    for i, v in enumerate(flood(sy * W + sx, is_navy)):
        if v: body[i] = 1

# Fill holes (status light, antialiasing): anything not reachable from the outside is inside.
outside = flood(0, lambda j: not body[j])
filled = bytearray(0 if outside[i] else 1 for i in range(W * H))


def dilate(mask, r):
    m = int.from_bytes(mask, 'big')
    out = m
    for k in range(1, r + 1):
        out |= m << (8 * k) | m >> (8 * k) | m << (8 * W * k) | m >> (8 * W * k)
    return bytearray(out.to_bytes(W * H, 'big')[-(W * H):])


near = dilate(filled, 3)  # include the antialiased rim
rgba = bytearray(W * H * 4)
swoosh = bytearray(d)
wide = dilate(filled, 6)
for i in range(W * H):
    if near[i]:
        g = d[i * 3 + 1]
        a = 255 if filled[i] and not (near[i] and not body[i] and g > 200) else 0
        # alpha from the rim's brightness: navy -> opaque, white -> clear
        a = max(0, min(255, round((254 - g) / (254 - NAVY[1]) * 255))) if not (filled[i] and body[i]) else 255
        if filled[i] and not body[i]: a = 255
        rgba[i * 4:i * 4 + 4] = bytes((NAVY[0], NAVY[1], NAVY[2], a))
    if wide[i]:
        swoosh[i * 3:i * 3 + 3] = bytes(BG)


def save(buf, pix, out):
    p = os.path.join(tmp, os.path.basename(out) + '.raw')
    open(p, 'wb').write(buf)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', pix, '-s', f'{W}x{H}', '-i', p, out], check=True)


os.makedirs(os.path.join(HERE, 'public'), exist_ok=True)
save(rgba, 'rgba', os.path.join(HERE, 'public', 'printer-body.png'))
save(swoosh, 'rgb24', os.path.join(HERE, 'public', 'swoosh.png'))
print('ok')
