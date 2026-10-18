/** PNG preview of a sanitised SVG (the app's picker loads these instead of the full files). Null if it cannot be drawn. */
export async function renderThumbnail(svg: string, size = 256): Promise<Buffer | null> {
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      background: 'rgba(255,255,255,1)',
      font: { loadSystemFonts: false },
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}
