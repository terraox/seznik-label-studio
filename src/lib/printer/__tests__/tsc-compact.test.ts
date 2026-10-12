import { encodeTscCompactTextSample, layoutTscCompactTextLines } from '@/lib/printer/tsc';

describe('layoutTscCompactTextLines', () => {
  it('spaces four lines across a 15 mm strip at 304 DPI', () => {
    const { startY, lineStep } = layoutTscCompactTextLines({
      lineCount: 4,
      heightMm: 15,
      dpi: 304,
    });
    expect(startY).toBe(12);
    expect(lineStep).toBeGreaterThanOrEqual(34);
  });
});

describe('encodeTscCompactTextSample', () => {
  it('emits SIZE, DIRECTION 0,0, and TEXT lines for narrow strips', () => {
    const bytes = encodeTscCompactTextSample({
      lines: ['Test print by Sez Print', 'Software by Seznik India'],
      widthMm: 50,
      heightMm: 15,
      gapMm: 3,
      dpi: 304,
    });
    const cmd = new TextDecoder().decode(bytes);
    expect(cmd).toMatch(/SIZE\s+50\.00\s*mm,\s*15\.00\s*mm/i);
    expect(cmd).toContain('DIRECTION 0,0');
    expect(cmd).toContain('OFFSET 0 mm');
    expect(cmd).toContain('REFERENCE 12,0');
    expect(cmd).toContain('TEXT 12,12,"1",0,1,1,"Test print by Sez Print"');
    expect(cmd).toContain('TEXT 12,93,"1",0,1,1,"Software by Seznik India"');
    expect(cmd).toContain('PRINT 1');
  });
});
