import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

export const SPLASH_FPS = 60;
export const SPLASH_FRAMES = 180; // 3.0 s
// The timeline below is written in 6.6 s of 'design time'; SPEED squeezes it into SPLASH_FRAMES.
const SPEED = 6.6 / (SPLASH_FRAMES / SPLASH_FPS);
export const SPLASH_SIZE = 1254;

const BG = '#fefefe';
const NAVY = '#11275a';
const CYAN = '#12b4ff';

// Coordinates below are in logo.png pixels (1254 x 1254).
const SLOT_Y = 577; // where the label leaves the printer
const TEXT_TOP = 895; // "SEZNIK" starts below this line
const TEXT_BOTTOM = 1215; // includes the INDIA line
const TEXT_LEFT = 120;
const TEXT_RIGHT = 1150;

// Outline of the label in the original logo (outer edge of its blue border).
const LABEL_OUTLINE: Array<[number, number]> = [
  [635, 599], [770, 581], [900, 581], [955, 615], [995, 680], [1030, 740], [1080, 790],
  [1138, 826], [1095, 837], [905, 867], [845, 872], [790, 852], [745, 812], [718, 758],
  [700, 708], [670, 640],
];
const CENTER = LABEL_OUTLINE.reduce(
  (c, [x, y]) => [c[0] + x / LABEL_OUTLINE.length, c[1] + y / LABEL_OUTLINE.length],
  [0, 0],
);
// Push every point away from the centre so antialiased fringes are covered / carried along.
// `side` lets the patch be much looser on the white right/bottom than next to the swoosh.
const grow = (px: number, side = 1) =>
  LABEL_OUTLINE.map(([x, y]) => {
    const dx = x - CENTER[0];
    const dy = y - CENTER[1];
    const len = Math.hypot(dx, dy);
    const k = x > 880 || y > 860 ? side : 1;
    return [x + (dx / len) * px * k, y + (dy / len) * px * k] as [number, number];
  });
const LABEL_CLIP = `polygon(${grow(3).map(([x, y]) => `${x}px ${y}px`).join(',')})`;
const LABEL_HOLE_POINTS = grow(11, 2).map(([x, y]) => `${x},${y}`).join(' ');

// Print content in the logo's label: grey text bars, QR code, barcode (padded boxes, logo px).
const CONTENT_BOXES: Array<[number, number, number, number]> = [
  [726, 606, 175, 52],
  [744, 652, 112, 46],
  [758, 690, 118, 46],
  [858, 638, 136, 104],
  [796, 738, 242, 100],
];
const HEAD_Y = SLOT_Y + 38;

// Front panel (the dark opening the label feeds from), drawn flat as a vector.
const PANEL_PATH =
  'M608 589Q608 569 628 568L937 553Q955 552 955 570L955 741Q955 761 935 761L628 763Q608 763 608 743Z';
const PANEL_WHITEOUT_WIDTH = 10; // where the print head burns the content onto the paper
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const range = (frame: number, fromS: number, toS: number, easing = Easing.out(Easing.cubic)) =>
  interpolate((frame / SPLASH_FPS) * SPEED, [fromS, toS], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const fill = { position: 'absolute', left: 0, top: 0, width: SPLASH_SIZE, height: SPLASH_SIZE } as const;

export const Splash = () => {
  const frame = useCurrentFrame();
  const t = (frame / SPLASH_FPS) * SPEED; // design time
  const realT = frame / SPLASH_FPS; // for wobble, so it does not speed up with everything else

  // 1. The swoosh draws in from the left.
  const wipe = range(frame, 0.15, 1.15, Easing.inOut(Easing.cubic));
  const edge = -25 + wipe * 160;
  const wipeMask = `linear-gradient(100deg, #000 ${edge - 25}%, transparent ${edge}%)`;

  // 2. The printer body builds up from the bottom, then the front opening draws in.
  const build = range(frame, 1.0, 1.9, Easing.inOut(Easing.cubic));
  const bx = -20 + build * 140; // soft edge position (%)
  const buildMask = `linear-gradient(0deg, #000 ${bx - 22}%, transparent ${bx}%)`;
  const bodyRise = (1 - range(frame, 1.0, 1.9)) * 34;
  const panelOpen = range(frame, 1.8, 2.4, Easing.inOut(Easing.cubic));
  const panelW = 347 * panelOpen;

  // 3. Blank paper feeds out of the slot, smoothly speeding up and slowing down.
  const feedStart = 2.6;
  const feedEnd = 4.7;
  const feed = range(frame, feedStart, feedEnd, Easing.bezier(0.45, 0, 0.3, 1));
  const feeding = t >= feedStart - 0.1 && t < feedEnd + 0.2;
  const motion = Math.sin(feed * Math.PI);
  const labelY = -(1 - feed) * 340 + Math.sin(realT * 30) * 0.5 * motion;
  const labelX = Math.sin(realT * 20) * 0.7 * motion;
  const headPower = clamp01(range(frame, feedStart, feedStart + 0.3) * (1 - range(frame, feedEnd - 0.3, feedEnd + 0.1)));
  const ledOn = clamp01(range(frame, 2.35, 2.6) * (1 - range(frame, feedEnd, feedEnd + 0.6)));
  const ledPulse = ledOn * (0.7 + 0.3 * Math.sin(realT * 14));
  const paperVisible = t >= 2.5 ? 1 : 0; // the paper only exists once the printer is fully built

  // 4. SEZNIK, then INDIA, printed row by row, top to bottom, like a thermal head.
  const rows = range(frame, 4.8, 6.1, Easing.inOut(Easing.sin));
  const rowY = TEXT_TOP + (TEXT_BOTTOM - TEXT_TOP) * rows;
  const rowOpacity = clamp01(range(frame, 4.8, 4.95) * (1 - range(frame, 6.0, 6.2)));

  // 5. A tiny settle once everything is on paper.
  const settle = 1 + 0.01 * Math.sin(range(frame, 6.0, 6.6, Easing.linear) * Math.PI);

  const paperClip = (extra: object) => ({ ...fill, ...extra });

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <div style={{ ...fill, transform: `translateY(-55px) scale(${settle})`, transformOrigin: '50% 50%' }}>
        {/* Swoosh: the logo with the printer removed and the label painted out. */}
        <div
          style={{
            ...fill,
            clipPath: `inset(0 0 ${SPLASH_SIZE - TEXT_TOP}px 0)`,
            WebkitMaskImage: wipeMask,
            maskImage: wipeMask,
          }}
        >
          <Img src={staticFile('swoosh.png')} style={fill} />
          <svg width={SPLASH_SIZE} height={SPLASH_SIZE} style={fill}>
            <polygon points={LABEL_HOLE_POINTS} fill={BG} />
            <path d={PANEL_PATH} fill={BG} stroke={BG} strokeWidth={PANEL_WHITEOUT_WIDTH} strokeLinejoin="round" />
          </svg>
        </div>

        {/* Printer body: flat navy, builds up from the bottom. */}
        <div
          style={{
            ...fill,
            WebkitMaskImage: buildMask,
            maskImage: buildMask,
            transform: `translateY(${bodyRise}px)`,
          }}
        >
          <Img src={staticFile('printer-body.png')} style={fill} />
          {/* Status light: dim when idle, bright while printing. */}
          <div
            style={{
              position: 'absolute',
              left: 817,
              top: 484,
              width: 74,
              height: 18,
              borderRadius: 9,
              background: '#0b7fb3',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 817,
              top: 484,
              width: 74,
              height: 18,
              borderRadius: 9,
              background: CYAN,
              opacity: ledPulse,
              boxShadow: `0 0 22px 6px ${CYAN}`,
            }}
          />
        </div>

        {/* Front opening, drawn in left to right. */}
        <svg width={SPLASH_SIZE} height={SPLASH_SIZE} style={{ ...fill, clipPath: `inset(0 ${SPLASH_SIZE - (608 + panelW)}px 0 0)` }}>
          <path d={PANEL_PATH} fill={NAVY} />
        </svg>

        {/* Blank label, clipped at the slot so it comes out from inside the printer. */}
        <div style={paperClip({ clipPath: `inset(${SLOT_Y}px 0 0 0)`, opacity: paperVisible })}>
          <div style={paperClip({ transform: `translate(${labelX}px, ${labelY}px)` })}>
            <Img src={staticFile('logo.png')} style={paperClip({ clipPath: LABEL_CLIP })} />
            {/* Erase the printed content so the paper leaves the printer blank. */}
            <svg width={SPLASH_SIZE} height={SPLASH_SIZE} style={paperClip({ clipPath: LABEL_CLIP })}>
              {CONTENT_BOXES.map(([x, y, w, h]) => (
                <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill="#fdfeff" />
              ))}
            </svg>
            {/* Paper tucks under the printer lip: soft shadow fixed at the slot. */}
            <div style={paperClip({ clipPath: LABEL_CLIP })}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  width: SPLASH_SIZE,
                  top: SLOT_Y - labelY,
                  height: 46,
                  background: 'linear-gradient(180deg, rgba(8,24,64,0.30), rgba(8,24,64,0))',
                  opacity: 1 - range(frame, feedEnd - 0.6, feedEnd - 0.2, Easing.linear),
                }}
              />
            </div>
          </div>
        </div>

        {/* Same label with its content: it burns in as the paper passes the print head. */}
        <div
          style={paperClip({
            opacity: paperVisible,
            clipPath: `inset(${HEAD_Y - 6}px 0 0 0)`,
            WebkitMaskImage: `linear-gradient(180deg, transparent ${HEAD_Y - 6}px, #000 ${HEAD_Y + 10}px)`,
            maskImage: `linear-gradient(180deg, transparent ${HEAD_Y - 6}px, #000 ${HEAD_Y + 10}px)`,
          })}
        >
          <div style={paperClip({ transform: `translate(${labelX}px, ${labelY}px)` })}>
            <Img src={staticFile('logo.png')} style={paperClip({ clipPath: LABEL_CLIP })} />
            {/* Print-head glow, only ever drawn on paper. */}
            <div style={paperClip({ clipPath: LABEL_CLIP })}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  width: SPLASH_SIZE,
                  top: HEAD_Y - labelY - 2,
                  height: 4,
                  background: CYAN,
                  opacity: feeding ? headPower * 0.9 : 0,
                  boxShadow: `0 0 12px 3px ${CYAN}`,
                }}
              />
            </div>
          </div>
        </div>

        {/* SEZNIK + INDIA, printed row by row. */}
        <div style={paperClip({ clipPath: `inset(${TEXT_TOP}px 0 ${SPLASH_SIZE - rowY}px 0)` })}>
          <Img src={staticFile('logo.png')} style={paperClip({ clipPath: `inset(0 0 ${SPLASH_SIZE - 1130}px 0)` })} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: SPLASH_SIZE,
              top: 1132,
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 34,
            }}
          >
            <div style={{ width: 150, height: 5, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${CYAN})` }} />
            <div
              style={{
                fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
                fontWeight: 900,
                fontStyle: 'italic',
                fontSize: 92,
                letterSpacing: 30,
                paddingLeft: 30,
                WebkitTextStroke: `3px ${NAVY}`,
                color: NAVY,
                lineHeight: 1,
              }}
            >
              INDIA
            </div>
            <div style={{ width: 150, height: 5, borderRadius: 3, background: `linear-gradient(270deg, transparent, ${CYAN})` }} />
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: TEXT_LEFT - 6,
            top: rowY - 2,
            width: TEXT_RIGHT - TEXT_LEFT + 12,
            height: 4,
            borderRadius: 2,
            background: CYAN,
            opacity: rowOpacity * 0.9,
            boxShadow: `0 0 14px 3px ${CYAN}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
