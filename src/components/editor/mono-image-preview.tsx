import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AlphaType,
  Canvas,
  ColorMatrix,
  ColorType,
  Fill,
  Image as SkiaImage,
  ImageShader,
  RuntimeShader,
  Shader,
  Skia,
  TileMode,
  useImage,
} from '@shopify/react-native-skia';
import { Image } from 'expo-image';

import type { EditorColorMode } from '@/lib/editor/image-mono';
import {
  applyMonoToRgba,
  monoShaderModeValue,
  resolveEditorColorMode,
} from '@/lib/editor/image-mono';
import { monoImageRuntimeEffect } from '@/lib/editor/mono-runtime-effect';

type MonoImagePreviewProps = {
  uri: string;
  widthPx: number;
  heightPx: number;
  colorMode?: EditorColorMode | string;
  grayThreshold?: number;
  tile?: boolean;
  contentFit?: 'fill' | 'contain' | 'cover';
  flipH?: boolean;
  flipV?: boolean;
  antiColor?: boolean;
};

/** RGB invert for Original + Anti-color when the mono shader is not used. */
const INVERT_COLOR_MATRIX = [
  -1, 0, 0, 0, 1,
  0, -1, 0, 0, 1,
  0, 0, -1, 0, 1,
  0, 0, 0, 1, 0,
];

function copyRgbaPixels(
  pixels: Uint8Array | Float32Array,
  width: number,
  height: number,
): Uint8Array | null {
  const needed = width * height * 4;
  if (pixels instanceof Uint8Array) {
    const rgba = new Uint8Array(needed);
    rgba.set(pixels.subarray(0, Math.min(pixels.length, needed)));
    return rgba;
  }
  if (pixels instanceof Float32Array && pixels.length >= needed) {
    const rgba = new Uint8Array(needed);
    for (let i = 0; i < needed; i++) {
      const v = pixels[i];
      rgba[i] = v <= 1 ? Math.round(v * 255) : Math.round(v);
    }
    return rgba;
  }
  return null;
}

export function MonoImagePreview({
  uri,
  widthPx,
  heightPx,
  colorMode,
  grayThreshold = 128,
  tile = false,
  contentFit = 'contain',
  flipH = false,
  flipV = false,
  antiColor = false,
}: MonoImagePreviewProps) {
  const mode = resolveEditorColorMode(colorMode);
  const source = useImage(uri);
  const monoEffect = useMemo(() => monoImageRuntimeEffect(), []);
  const needsMono = mode !== 'Original';
  const [cpuProcessed, setCpuProcessed] = useState<ReturnType<typeof useImage>>(null);

  // CPU bake only when the GPU shader is unavailable (rare) and we still need mono/invert.
  useEffect(() => {
    if (!source || monoEffect || (mode === 'Original' && !antiColor)) {
      setCpuProcessed(null);
      return;
    }
    let cancelled = false;
    try {
      const raster = source.makeNonTextureImage();
      const width = raster.width();
      const height = raster.height();
      const pixels = raster.readPixels(0, 0, {
        width,
        height,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      });
      if (!pixels || cancelled) {
        setCpuProcessed(source);
        return;
      }
      const rgba = copyRgbaPixels(pixels, width, height);
      if (!rgba) {
        setCpuProcessed(source);
        return;
      }
      applyMonoToRgba(rgba, width, height, grayThreshold, mode, antiColor);
      const next = Skia.Image.MakeImage(
        {
          width,
          height,
          colorType: ColorType.RGBA_8888,
          alphaType: AlphaType.Unpremul,
        },
        Skia.Data.fromBytes(rgba),
        width * 4,
      );
      if (!cancelled) setCpuProcessed(next ?? source);
    } catch {
      if (!cancelled) setCpuProcessed(source);
    }
    return () => {
      cancelled = true;
    };
  }, [source, mode, grayThreshold, uri, antiColor, monoEffect]);

  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const display = cpuProcessed ?? source;
  const tileW = display ? Math.max(8, display.width()) : w;
  const tileH = display ? Math.max(8, display.height()) : h;

  const transforms = useMemo(() => {
    const list: ({ scaleX: number } | { scaleY: number })[] = [];
    if (flipH) list.push({ scaleX: -1 });
    if (flipV) list.push({ scaleY: -1 });
    return list;
  }, [flipH, flipV]);

  const monoUniforms = useMemo(
    () => ({
      threshold: grayThreshold,
      mode: monoShaderModeValue(mode),
      invert: antiColor ? 1 : 0,
    }),
    [grayThreshold, mode, antiColor],
  );

  if (mode === 'Original' && !tile && !antiColor) {
    return (
      <View style={styles.fill}>
        <Image
          source={{ uri }}
          style={[styles.fill, transforms.length > 0 ? { transform: transforms } : null]}
          contentFit={contentFit}
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  const useGpuMono = Boolean(monoEffect && needsMono && source);

  return (
    <View
      style={[
        styles.fill,
        antiColor && styles.antiBg,
        transforms.length > 0 ? { transform: transforms } : null,
      ]}>
      <Canvas style={{ width: w, height: h }} pointerEvents="none">
        {useGpuMono && monoEffect && source && !tile ? (
          <SkiaImage image={source} x={0} y={0} width={w} height={h} fit={contentFit}>
            <RuntimeShader source={monoEffect} uniforms={monoUniforms} />
          </SkiaImage>
        ) : null}
        {useGpuMono && monoEffect && source && tile ? (
          <Fill>
            <Shader source={monoEffect} uniforms={monoUniforms}>
              <ImageShader
                image={source}
                tx={TileMode.Repeat}
                ty={TileMode.Repeat}
                fit="none"
                width={tileW}
                height={tileH}
              />
            </Shader>
          </Fill>
        ) : null}
        {!useGpuMono && display && !tile ? (
          <SkiaImage image={display} x={0} y={0} width={w} height={h} fit={contentFit}>
            {mode === 'Original' && antiColor && !cpuProcessed ? (
              <ColorMatrix matrix={INVERT_COLOR_MATRIX} />
            ) : null}
          </SkiaImage>
        ) : null}
        {!useGpuMono && display && tile ? (
          <Fill>
            <ImageShader
              image={display}
              tx={TileMode.Repeat}
              ty={TileMode.Repeat}
              fit="none"
              width={tileW}
              height={tileH}
            />
          </Fill>
        ) : null}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  antiBg: {
    backgroundColor: '#111827',
  },
});
