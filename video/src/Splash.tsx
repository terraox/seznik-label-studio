import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

export type SplashProps = { background: 'white' | 'gradient' };

// Everything below is drawn in a 1254 x 1254 space, the size of the logo artwork.
const SIZE = 1254;
const STAGE_PX = 900; // on-screen size of that space
const SCALE = STAGE_PX / SIZE;

// Paper tile: the flat icon's tile morphs into the finished logo's tile.
const ICON_PAPER = { x: 130, y: 135, w: 995, h: 985, r: 190 };
const LOGO_PAPER = { x: 112, y: 105, w: 1000, h: 1010, r: 185 };
// The two blocks of artwork cut from the flat icon, moved to where the finished logo has them.
const BLOCK_A = { from: { x: 170, y: 345, s: 1 }, to: { x: 146.5, y: 272.7, s: 0.99 } };
const BLOCK_B = { from: { x: 235, y: 750, s: 1 }, to: { x: 205.6, y: 675.6, s: 0.874 } };

// Peel edge of the finished logo: right edge, S-curve, then the sloped bottom edge.
type Pt = [number, number];
const CORNER: Pt = [1112, 1115];
const R: Pt = [1110, 430];
const C1: Pt = [1095, 700];
const C2: Pt = [930, 820];
const S1: Pt = [760, 985];
const BT: Pt = [250, 1078];

/** The video's peel stops short of the finished logo's curl, so it never shows more than the logo does. */
const PEEL_MAX = 0.8;

const PAPER_COLOR = '#F7F8FA';
const NAVY_A = '#0F3377';
const NAVY_B = '#0A2559';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toward = (p: Pt, t: number): Pt => [CORNER[0] + (p[0] - CORNER[0]) * t, CORNER[1] + (p[1] - CORNER[1]) * t];

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** Points along the peel edge for a peel amount p (0 = at the corner, 1 = the finished logo). */
function edgePoints(p: number): Pt[] {
  const [r, c1, c2, s1, bt] = [R, C1, C2, S1, BT].map((pt) => toward(pt, p));
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) pts.push(bezier(r, c1, c2, s1, i / 24));
  for (let i = 1; i <= 10; i++) pts.push([lerp(s1[0], bt[0], i / 10), lerp(s1[1], bt[1], i / 10)]);
  return pts;
}

const poly = (pts: Pt[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');

export const Splash: React.FC<SplashProps> = ({ background }) => {
  const f = useCurrentFrame();
  const dark = background === 'gradient';

  // Timeline (frames): flat hold, peel, morph to the finished logo, tagline.
  const peel = interpolate(f, [12, 46], [0, 1], { easing: Easing.bezier(0.45, 0, 0.2, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const morph = interpolate(f, [8, 40], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iconOpacity = interpolate(f, [0, 12], [1, 0], { extrapolateRight: 'clamp' });
  const logoOpacity = interpolate(f, [46, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tagline = interpolate(f, [56, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const settle = interpolate(f, [0, 10], [0.97, 1], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });

  const paper = {
    x: lerp(ICON_PAPER.x, LOGO_PAPER.x, morph),
    y: lerp(ICON_PAPER.y, LOGO_PAPER.y, morph),
    w: lerp(ICON_PAPER.w, LOGO_PAPER.w, morph),
    h: lerp(ICON_PAPER.h, LOGO_PAPER.h, morph),
    r: lerp(ICON_PAPER.r, LOGO_PAPER.r, morph),
  };
  const block = (b: typeof BLOCK_A) => ({
    left: lerp(b.from.x, b.to.x, morph),
    top: lerp(b.from.y, b.to.y, morph),
    scale: lerp(b.from.s, b.to.s, morph),
  });
  const a = block(BLOCK_A);
  const b = block(BLOCK_B);

  // Peel geometry.
  const edge = edgePoints(peel * PEEL_MAX);
  const rEnd = edge[0];
  const btEnd = edge[edge.length - 1];
  const keptPath = `M0 0 H${CORNER[0]} V${rEnd[1]} ${poly(edge).replace(/^M/, 'L')} L${paper.x} ${CORNER[1]} L0 ${CORNER[1]} Z`;
  const ext = peel * 20;
  const backingPath = `${poly(edge)} L${btEnd[0]} ${CORNER[1] + peel * 22} L${CORNER[0] + ext} ${CORNER[1] + peel * 22} L${CORNER[0] + ext} ${rEnd[1]} Z`;
  // The lifted flap is a band along the edge, nearest the corner, tapering to nothing at both ends.
  const inner: Pt[] = edge.map((q, i) => {
    const prev = edge[Math.max(0, i - 1)];
    const next = edge[Math.min(edge.length - 1, i + 1)];
    let nx = -(next[1] - prev[1]);
    let ny = next[0] - prev[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    // Point the normal toward the corner.
    if (nx * (CORNER[0] - q[0]) + ny * (CORNER[1] - q[1]) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const u = i / (edge.length - 1);
    const width = 130 * peel * Math.pow(Math.sin(Math.PI * u), 0.7);
    return [q[0] + nx * width, q[1] + ny * width];
  });
  const flapPath = `${poly(edge)} ${poly([...inner].reverse()).replace(/^M/, 'L')} Z`;

  const bg = dark ? 'radial-gradient(circle at 50% 38%, #25399A 0%, #14246B 45%, #0A1240 100%)' : '#FEFEFE';
  const taglineColor = dark ? '#FFFFFF' : '#4A5070';

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: 'absolute',
          left: (1080 - STAGE_PX) / 2,
          top: 330,
          width: SIZE,
          height: SIZE,
          transform: `scale(${SCALE * settle})`,
          transformOrigin: '0 0',
          filter: `drop-shadow(0 ${dark ? 40 : 34}px ${dark ? 50 : 42}px rgba(${dark ? '0,0,20,0.55' : '20,30,80,0.28'}))`,
        }}>
        {/* Paper, and the navy backing that shows where it lifts. */}
        <svg width={SIZE} height={SIZE} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <clipPath id="paperClip">
              <rect x={paper.x} y={paper.y} width={paper.w} height={paper.h} rx={paper.r} />
            </clipPath>
            <clipPath id="backClip">
              <rect x={paper.x} y={paper.y} width={paper.w + ext} height={paper.h + peel * 22} rx={paper.r} />
            </clipPath>
            <linearGradient id="navy" x1="0.2" y1="0" x2="0.8" y2="1">
              <stop offset="0" stopColor={NAVY_A} />
              <stop offset="1" stopColor={NAVY_B} />
            </linearGradient>
            <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>
          <g clipPath="url(#backClip)">
            <path d={backingPath} fill="url(#navy)" />
            <path d={flapPath} fill="rgba(0,10,40,0.55)" filter="url(#soft)" transform="translate(-8 14)" />
          </g>
          <g clipPath="url(#paperClip)">
            <path d={keptPath} fill={PAPER_COLOR} />
          </g>
        </svg>

        {/* Artwork from the flat icon, drifting into the finished logo's layout. */}
        <Img
          src={staticFile('icon-block-a.png')}
          style={{ position: 'absolute', left: a.left, top: a.top, transform: `scale(${a.scale})`, transformOrigin: '0 0', mixBlendMode: 'multiply' }}
        />
        <Img
          src={staticFile('icon-block-b.png')}
          style={{ position: 'absolute', left: b.left, top: b.top, transform: `scale(${b.scale})`, transformOrigin: '0 0', mixBlendMode: 'multiply' }}
        />

        {/* The folded-up flap, on top of the artwork. */}
        <svg width={SIZE} height={SIZE} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <clipPath id="flapClip">
              <rect x={paper.x} y={paper.y} width={paper.w + ext} height={paper.h + peel * 22} rx={paper.r} />
            </clipPath>
            <linearGradient id="flap" gradientUnits="userSpaceOnUse" x1="1100" y1="640" x2="800" y2="1010">
              <stop offset="0" stopColor="#3F82EE" />
              <stop offset="0.35" stopColor="#CFE0FA" />
              <stop offset="1" stopColor="#FFFFFF" />
            </linearGradient>
          </defs>
          <g clipPath="url(#flapClip)">
            <path d={flapPath} fill="url(#flap)" />
            <path d={poly(edge)} fill="none" stroke="rgba(20,40,110,0.25)" strokeWidth={2} opacity={Math.min(1, peel * 5)} />
          </g>
        </svg>

        {/* The exact first frame, and the exact last frame. */}
        <Img src={staticFile('iconnnnn-cut.png')} style={{ position: 'absolute', inset: 0, width: SIZE, height: SIZE, opacity: iconOpacity }} />
        <Img src={staticFile('logo2-cut.png')} style={{ position: 'absolute', inset: 0, width: SIZE, height: SIZE, opacity: logoOpacity }} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 1400,
          textAlign: 'center',
          fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
          fontWeight: 600,
          fontSize: 58,
          color: taglineColor,
          opacity: tagline,
          transform: `translateY(${(1 - tagline) * 14}px)`,
        }}>
        Made in India 🇮🇳 with love ❤️
      </div>
    </AbsoluteFill>
  );
};
