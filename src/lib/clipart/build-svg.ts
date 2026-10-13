import type { ClipartCatalogEntry } from '@/constants/clipart-catalog';

const VB = 24;

export function wrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" fill="none">${inner}</svg>`;
}

export function p(d: string, fill = false, sw = 1.6): string {
  return fill
    ? `<path fill="currentColor" d="${d}"/>`
    : `<path fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;
}

export function c(cx: number, cy: number, r: number, fill = false, sw = 1.6): string {
  return fill
    ? `<circle fill="currentColor" cx="${cx}" cy="${cy}" r="${r}"/>`
    : `<circle fill="none" stroke="currentColor" stroke-width="${sw}" cx="${cx}" cy="${cy}" r="${r}"/>`;
}

export function r(x: number, y: number, w: number, h: number, rx = 0, fill = false, sw = 1.6): string {
  return fill
    ? `<rect fill="currentColor" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`
    : `<rect fill="none" stroke="currentColor" stroke-width="${sw}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
}

export function l(x1: number, y1: number, x2: number, y2: number, sw = 1.6): string {
  return `<line stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

export function e(cx: number, cy: number, rx: number, ry: number, fill = false, sw = 1.6): string {
  return fill
    ? `<ellipse fill="currentColor" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`
    : `<ellipse fill="none" stroke="currentColor" stroke-width="${sw}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
}

export function poly(pts: string, fill = false, sw = 1.6): string {
  return fill
    ? `<polygon fill="currentColor" points="${pts}"/>`
    : `<polygon fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round" points="${pts}"/>`;
}

/** Tiny unique mark so 80 siblings in a family stay distinct on the grid. */
function mark(v: number): string {
  const a = 2 + (v % 5);
  const b = 2 + ((v * 3) % 5);
  const style = v % 7;
  if (style === 0) return c(a + 0.6, b + 0.6, 1.1, true);
  if (style === 1) return r(a, b, 2.2, 2.2, 0.4, true);
  if (style === 2) return poly(`${a},${b + 2.2} ${a + 1.1},${b} ${a + 2.2},${b + 2.2}`, true);
  if (style === 3) return c(a + 1, b + 1, 1.2) + c(a + 1, b + 1, 0.4, true);
  if (style === 4) return l(a, b, a + 2.2, b + 2.2) + l(a + 2.2, b, a, b + 2.2);
  if (style === 5) return p(`M${a} ${b + 2}c1-3 2.2-3 2.2 0`, false, 1.3);
  return e(a + 1.1, b + 1.1, 1.3, 0.8, true);
}

function shopFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return p('M5 9l2-5h10l2 5z') + r(5, 9, 14, 11) + r(10, 13, 4, 7);
    case 1:
      return p('M4 7h16l-1.5 10H5.5z') + p('M9 7V5.5a3 3 0 016 0V7');
    case 2:
      return p('M5 6h2l1 11h11l1.5-7H8') + c(9, 20, 1.3, true) + c(17, 20, 1.3, true);
    case 3:
      return p('M4 12l8-8h8v8l-8 8z') + c(16, 8, 1.4, true);
    case 4:
      return c(12, 12, 8) + c(12, 12, 5) + p('M12 8v8M10 10h4M10 14h4');
    case 5:
      return r(5, 4, 2, 16, 0) + r(8.5, 4, 1.2, 16) + r(11, 4, 2.4, 16) + r(15, 4, 1.2, 16) + r(18, 4, 2, 16);
    case 6:
      return r(4, 4, 16, 16, 2) + p('M8 8h8M8 12h8M8 16h5');
    case 7:
      return r(3, 6, 18, 12, 2) + l(3, 11, 21, 11) + r(5, 14, 6, 2, 0.5, true);
    case 8:
      return c(8, 8, 2) + c(16, 16, 2) + l(9, 17, 16, 7);
    case 9:
      return r(6, 3, 12, 18, 1) + p('M6 21l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5') + l(9, 8, 15, 8) + l(9, 12, 15, 12);
    case 10:
      return r(6, 7, 12, 12, 1) + p('M6 7l6-3 6 3') + l(12, 4, 12, 19);
    case 11:
      return r(8, 4, 8, 16, 3) + r(10, 2, 4, 3, 1);
    case 12:
      return p('M7 20V9l5-5 5 5v11H7z') + r(10, 13, 4, 7);
    case 13:
      return r(5, 8, 14, 10, 1) + l(12, 8, 12, 18) + p('M8 8c0-2 1.5-3 4-1.5C14.5 5 16 6 16 8');
    case 14:
      return r(4, 6, 16, 12, 1) + l(4, 10, 20, 10) + c(7, 14, 1, true) + c(11, 14, 1, true);
    default:
      return r(5, 5, 14, 14, 2) + p('M8 12h8M12 8v8');
  }
}

function foodFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return e(12, 16, 9, 4) + p('M5 16c1 4 13 4 14 0') + c(12, 11, 2, true);
    case 1:
      return e(12, 14, 8, 6) + p('M6 12c2-6 10-6 12 0');
    case 2:
      return p('M4 14c2 6 14 6 16 0') + p('M7 14c.5-5 9.5-5 10 0');
    case 3:
      return p('M5 11h14s-1 9-7 9-7-9-7-9z') + p('M8 11c0-4 8-4 8 0');
    case 4:
      return p('M6 8h10v9a5 5 0 01-10 0z') + p('M16 10h3a3 3 0 010 6h-3');
    case 5:
      return poly('12,4 20,18 4,18', false) + c(12, 14, 1.5, true);
    case 6:
      return c(12, 13, 7) + c(12, 13, 3, true);
    case 7:
      return p('M7 6c5 2 5 10 0 14M12 6c5 2 5 10 0 14M17 6c5 2 5 10 0 14');
    case 8:
      return p('M4 12c4-8 12-8 16 0-4 8-12 8-16 0z') + p('M8 12h8');
    case 9:
      return e(12, 8, 4, 5) + p('M12 13v7') + p('M9 20h6');
    case 10:
      return p('M8 4v5M12 4v5M16 4v5M8 9h8M12 9v12');
    case 11:
      return r(5, 7, 14, 12, 2) + r(8, 4, 3, 4, 1) + r(13, 4, 3, 4, 1);
    case 12:
      return p('M5 10c3-6 11-6 14 0v2H5z') + p('M6 12c1 6 11 6 12 0');
    case 13:
      return p('M6 15c2-8 10-8 12 0') + p('M7 15c.4 4 9.6 4 10 0') + p('M12 6v4');
    case 14:
      return p('M4 13h16s-2 8-8 8-8-8-8-8z') + l(8, 9, 8, 13) + l(12, 8, 12, 13) + l(16, 9, 16, 13);
    default:
      return c(9, 12, 4) + c(15, 12, 4) + p('M9 16c2 3 4 3 6 0');
  }
}

function festiveFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return p('M8 16c0-5 8-5 8 0') + p('M6 16h12s-1 5-6 5-6-5-6-5z') + p('M12 5c2 3 2 6 0 8-2-2-2-5 0-8z', true);
    case 1:
      return c(12, 12, 8) + c(12, 12, 3) + p('M12 4v3M12 17v3M4 12h3M17 12h3');
    case 2:
      return p('M12 20s-8-5.4-8-10.2A4.6 4.6 0 0112 6a4.6 4.6 0 018 3.8C20 14.6 12 20 12 20z', true);
    case 3:
      return p('M12 3l2.2 6.6H21l-5.4 4 2.1 6.6L12 16.8 6.3 20.2 8.4 13.6 3 9.6h6.8z', true);
    case 4:
      return p('M7 20V10l5-7 5 7v10') + p('M9 20h6') + c(12, 12, 1.5, true);
    case 5:
      return p('M12 21c4 0 7-3 7-8 0-4-3-7-5-9-1 3-3 4-3 7 0-2-2-4-3-6-3 3-5 6-5 10 0 4 3 6 9 6z');
    case 6:
      return c(12, 8, 3, true) + p('M6 20c1-6 11-6 12 0') + p('M9 11c-4 2-4 6-1 8M15 11c4 2 4 6 1 8');
    case 7:
      return p('M4 14h16l-2 6H6z') + p('M8 14V9a4 4 0 018 0v5');
    case 8:
      return p('M12 4v16') + p('M8 8h8M9 12h6') + c(12, 18, 2);
    case 9:
      return p('M5 19c3-12 11-12 14 0') + c(12, 8, 2, true) + l(12, 10, 12, 19);
    case 10:
      return p('M4 13a8 8 0 0116 0H4z') + l(12, 13, 12, 20) + p('M12 20c2.2 0 3-1.2 3-1.2');
    case 11:
      return p('M6 4h12l-3 4 3 4H6z') + l(6, 4, 6, 21);
    case 12:
      return e(12, 14, 8, 3) + p('M7 14c0-6 10-6 10 0');
    case 13:
      return p('M12 3l1.8 5 5.2.2-4 3.7 1.4 5.1L12 14.4 7.6 17l1.4-5.1-4-3.7 5.2-.2z');
    case 14:
      return c(12, 12, 8) + p('M8 12c1.5-3 6.5-3 8 0M8 12c1.5 3 6.5 3 8 0');
    default:
      return p('M4 18c2-2 4-2 4 0s2 2 4 0 2-2 4 0 2 2 4 0') + p('M4 14c2-2 4-2 4 0s2 2 4 0 2-2 4 0 2 2 4 0');
  }
}

function farmFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return e(12, 14, 7, 5) + c(9, 9, 2.2, true) + c(15, 9, 2.2, true) + p('M8 18c2 3 6 3 8 0');
    case 1:
      return r(4, 12, 16, 8) + p('M4 12l8-8 8 8') + r(10, 14, 4, 6);
    case 2:
      return p('M4 16h13l3-4H14') + c(8, 18, 2) + c(16, 18, 2);
    case 3:
      return p('M12 20c5 0 8-4 8-9 0-2-8-8-8-8S4 9 4 11c0 5 3 9 8 9z');
    case 4:
      return l(12, 4, 12, 20) + p('M12 8c4 1 6 5 6 8M12 8C8 9 6 13 6 16') + p('M7 20h10');
    case 5:
      return r(9, 3, 6, 10, 1) + r(6, 13, 12, 8, 2);
    case 6:
      return c(7, 10, 3) + c(17, 10, 3) + l(10, 10, 14, 10) + p('M7 13c0 6 10 6 10 0');
    case 7:
      return r(3, 10, 6, 10) + r(9, 14, 12, 6) + poly('9,14 9,8 14,14');
    case 8:
      return p('M5 19h14') + p('M8 19V8l4-4 4 4v11') + c(12, 11, 1.4, true);
    case 9:
      return e(12, 16, 8, 3) + p('M7 16V9c0-4 10-4 10 0v7');
    case 10:
      return p('M4 14l4-4h8l4 4v5H4z') + r(10, 16, 4, 3);
    case 11:
      return c(12, 8, 3) + p('M6 20l3-8h6l3 8z');
    case 12:
      return p('M4 18c4-10 12-10 16 0') + p('M8 10c2-4 6-4 8 0');
    case 13:
      return r(8, 4, 8, 14, 4) + r(10, 18, 4, 3);
    case 14:
      return p('M7 4h10l-1 7-4 11h-4L8 11z');
    default:
      return c(12, 12, 7) + p('M9 12h6M12 9v6');
  }
}

function vehicleFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return p('M4 15h13l3-4h-6l-2-3H9L7 11H4z') + c(8, 17, 2) + c(16, 17, 2);
    case 1:
      return p('M5 14h10l2-4H8z') + c(8, 16, 2) + c(15, 16, 2) + r(7, 8, 4, 3, 1);
    case 2:
      return c(12, 14, 7) + c(12, 14, 2, true) + l(12, 7, 12, 4) + l(12, 4, 16, 5);
    case 3:
      return r(3, 8, 18, 8, 2) + r(6, 5, 8, 4, 1) + c(8, 17, 2) + c(17, 17, 2);
    case 4:
      return p('M3 16h18') + p('M5 16V9h10l4 4v3') + c(8, 18, 2) + c(16, 18, 2);
    case 5:
      return p('M4 17h16V9l-5-4H9L4 9z') + r(9, 11, 6, 3);
    case 6:
      return e(12, 16, 9, 3) + p('M5 16c1-7 13-7 14 0') + r(10, 8, 4, 4, 1);
    case 7:
      return r(6, 4, 12, 16, 2) + r(8, 7, 8, 6) + l(9, 20, 15, 20);
    case 8:
      return p('M4 12h16l-2 7H6z') + p('M7 12V7h10v5');
    case 9:
      return c(7, 16, 3) + c(17, 16, 3) + r(6, 8, 12, 6, 1);
    case 10:
      return p('M3 14l4-6h10l4 6v5H3z') + l(7, 8, 9, 14) + l(17, 8, 15, 14);
    case 11:
      return r(5, 10, 14, 7, 1) + p('M5 10l3-5h8l3 5') + c(9, 18, 1.8) + c(15, 18, 1.8);
    case 12:
      return p('M4 18h16') + p('M6 18c0-8 12-8 12 0') + c(12, 10, 1.5, true);
    case 13:
      return r(4, 6, 16, 10, 2) + p('M8 16l4 4 4-4');
    case 14:
      return r(8, 3, 8, 14, 2) + r(7, 17, 10, 4, 1) + c(12, 9, 2);
    default:
      return c(12, 12, 8) + p('M8 12h8M12 8l4 4-4 4');
  }
}

function homeFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return p('M4 12l8-8 8 8v8H4z') + r(10, 13, 4, 7);
    case 1:
      return r(5, 4, 14, 16, 1) + r(9, 12, 6, 8);
    case 2:
      return r(6, 3, 12, 18, 2) + l(6, 11, 18, 11) + c(16, 7, 0.8, true) + c(16, 15, 0.8, true);
    case 3:
      return r(4, 6, 16, 12, 2) + r(7, 9, 7, 6) + c(16, 12, 1.2, true);
    case 4:
      return c(12, 12, 2.2, true) + e(12, 6, 3, 4) + e(12, 18, 3, 4) + e(6, 12, 4, 3) + e(18, 12, 4, 3);
    case 5:
      return r(3, 7, 18, 10, 2) + l(7, 12, 7, 14) + l(12, 12, 12, 14) + l(17, 12, 17, 14);
    case 6:
      return r(3, 5, 18, 12, 2) + l(8, 17, 12, 21) + l(16, 17, 12, 21);
    case 7:
      return p('M4 16h16l-3-8H8z') + l(6, 16, 6, 19) + l(6, 19, 16, 19);
    case 8:
      return c(8, 16, 5) + r(12, 8, 8, 5, 2) + l(12, 11, 8, 13);
    case 9:
      return r(4, 8, 16, 10, 3) + r(8, 5, 3, 5, 1) + r(13, 5, 3, 5, 1);
    case 10:
      return e(11, 13, 6, 7) + p('M17 12c3 0 4 4 2 5') + l(11, 4, 11, 6);
    case 11:
      return r(8, 8, 8, 10, 1) + r(9, 3, 6, 5, 1) + r(7, 18, 10, 3, 1);
    case 12:
      return r(7, 4, 10, 16, 1) + l(7, 10, 17, 10) + r(10, 14, 4, 6);
    case 13:
      return p('M6 20V10h12v10') + p('M4 10h16l-8-6z');
    case 14:
      return r(5, 8, 14, 12, 2) + p('M5 8c3-4 11-4 14 0');
    default:
      return r(8, 6, 8, 12, 1) + l(8, 10, 16, 10) + c(14, 14, 0.8, true);
  }
}

function healthFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return r(10, 4, 4, 16, 1, true) + r(4, 10, 16, 4, 1, true);
    case 1:
      return r(5, 6, 14, 14, 2) + r(10, 4, 4, 4, 1, true) + r(10, 10, 4, 6);
    case 2:
      return r(8, 3, 8, 12, 3) + r(7, 14, 10, 7, 2);
    case 3:
      return e(9, 10, 3.5, 5) + e(15, 10, 3.5, 5) + r(10.5, 14, 3, 6, 1);
    case 4:
      return p('M7 4h3v6h6v3h-6v7H7v-7H3V10h4z');
    case 5:
      return p('M6 12c0-6 12-6 12 0') + p('M8 12c0 6 8 6 8 0') + c(12, 12, 1.4, true);
    case 6:
      return c(12, 8, 3) + p('M12 11v9') + p('M9 16h6');
    case 7:
      return r(4, 8, 16, 10, 2) + p('M8 8V6a4 4 0 018 0v2');
    case 8:
      return p('M5 19c4-12 10-12 14 0') + c(12, 7, 2.2, true);
    case 9:
      return c(8, 9, 3) + p('M10.5 10.5 20 20') + c(8, 16, 2);
    case 10:
      return r(6, 4, 12, 16, 2) + p('M9 9h6M9 13h6M9 17h4');
    case 11:
      return p('M4 12h16') + p('M12 4v16') + c(12, 12, 7);
    case 12:
      return e(12, 14, 7, 6) + p('M12 4v6') + c(12, 14, 2, true);
    case 13:
      return p('M7 20V8l5-4 5 4v12') + p('M10 12h4v8h-4z');
    case 14:
      return r(5, 5, 14, 14, 3) + p('M9 12h6M12 9v6');
    default:
      return p('M12 21s-7-4.8-7-10a4 4 0 017-2 4 4 0 017 2c0 5.2-7 10-7 10z');
  }
}

function officeFamily(v: number): string {
  const kind = v % 16;
  switch (kind) {
    case 0:
      return r(5, 3, 14, 18, 1) + l(8, 8, 16, 8) + l(8, 12, 16, 12) + l(8, 16, 13, 16);
    case 1:
      return p('M6 4h9l5 5v11H6z') + p('M15 4v5h5');
    case 2:
      return r(4, 6, 16, 12, 1) + p('M4 10h16') + r(7, 13, 5, 2, 0.4, true);
    case 3:
      return p('M7 4h10v17l-2.5-1.6-2.5 1.6-2.5-1.6L7 21z') + l(10, 9, 16, 9);
    case 4:
      return r(3, 7, 18, 11, 1) + p('M7 7l2-3h6l2 3');
    case 5:
      return c(12, 12, 8) + p('M9 12h4.5a2 2 0 010 4H11') + l(12, 8, 12, 10);
    case 6:
      return r(5, 8, 14, 10, 1) + r(8, 5, 8, 4, 1) + p('M9 13h6M9 16h4');
    case 7:
      return r(4, 5, 16, 14, 2) + r(6, 8, 7, 8) + c(16, 12, 1.4, true);
    case 8:
      return r(6, 3, 12, 18, 1) + p('M9 8h6M9 12h6M9 16h4');
    case 9:
      return c(12, 12, 8) + c(12, 12, 4) + l(12, 8, 12, 12) + l(12, 12, 15, 14);
    case 10:
      return r(5, 4, 14, 16, 2) + p('M8 9h8M8 13h8M8 17h5');
    case 11:
      return p('M8 20V8h10v12') + p('M6 8h14') + p('M10 4h6v4H10z');
    case 12:
      return r(4, 6, 16, 12, 1) + p('M8 10l3 3 6-6');
    case 13:
      return p('M5 7h14v12H5z') + p('M8 4h8v3H8z') + l(8, 11, 16, 11);
    case 14:
      return c(9, 14, 4) + r(12, 6, 8, 10, 1) + l(12, 11, 20, 11);
    default:
      return r(6, 4, 12, 16, 1) + p('M9 8h6M9 12h6');
  }
}

const FAMILY: Record<string, (v: number) => string> = {
  shop: shopFamily,
  food: foodFamily,
  festive: festiveFamily,
  farm: farmFamily,
  vehicle: vehicleFamily,
  home: homeFamily,
  health: healthFamily,
  office: officeFamily,
};

const HERO: Record<string, string> = {
  Om: p(
    'M7.2 14.5c0-2.2 1.6-3.6 3.7-3.6 1.3 0 2.3.6 2.3 1.7 0 2.4-5.4 1.5-5.4 4.6 0 1.6 1.4 2.6 3.3 2.6 2.4 0 3.8-1.3 4.6-2.7M14.4 9.2c.9-1.6 2.2-2.6 3.8-2.6 1.6 0 2.6 1 2.6 2.3 0 2.4-4.4 1.8-4.4 4.4 0 .7.4 1.2 1.1 1.2.6 0 1.2-.3 1.7-.8M5.5 8.8c.7-1.8 2.2-3 4.1-3 1.2 0 2.2.5 2.2 1.6 0 1.7-3.2 1.4-3.2 3.2',
    false,
    1.7,
  ),
  'Rupee': p('M7 6h10M7 10h10M9 6c4 0 6 2.4 6 6.2 0 4.5-3 7.8-8 7.8') + l(9, 10, 16, 20),
  Diya: festiveFamily(0),
  Lotus: p('M12 20c-6-1-8-6-8-9 3 1 6 1 8 0 2 1 5 1 8 0 0 3-2 8-8 9z') + p('M12 11c-2-5 0-8 0-8s2 3 0 8z'),
  Kalash: p('M8 20c0-6 8-6 8 0z') + p('M9 10c0-4 6-4 6 0') + c(12, 5, 1.4, true),
  Namaste: p('M9 21V12L12 8l3 4v9') + c(9, 8, 2) + c(15, 8, 2) + p('M12 8v4'),
  Trishul: p('M12 22V8') + p('M12 8L7 4M12 8l5-4M7 4v3M17 4v3') + p('M9 14h6'),
  'UPI QR': r(4, 4, 16, 16, 1) + r(7, 7, 4, 4, 0.5, true) + r(13, 7, 4, 4, 0.5, true) + r(7, 13, 4, 4, 0.5, true) + r(13, 14, 2, 2, 0.3, true),
  'Green chilli': p('M14 4c4 4 4 12-2 15-5 2-8-2-7-7 1-5 6-7 9-8z') + p('M14 4c1-2 3-2 4-1'),
  Temple: p('M6 20V11l6-7 6 7v9') + p('M10 20v-6h4v6') + p('M4 20h16'),
};

export function buildClipartSvg(entry: ClipartCatalogEntry): string {
  const [family, raw] = entry.motif.split(':');
  const variant = Number(raw) || 0;
  const hero = HERO[entry.label];
  const body = hero ?? (FAMILY[family] ?? shopFamily)(variant);
  return wrap(`${body}${mark(variant)}`);
}

export function tintClipartSvg(svg: string, color: string): string {
  return svg.replace(/currentColor/g, color);
}
