import * as ImagePicker from 'expo-image-picker';
import { useCallback, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { pickDocumentAsset } from '@/lib/file-import/pick-document';
import { getImagePixelSize } from '@/lib/file-import/resolve-image-size';
import { useFileSourceSheet } from '@/lib/file-import/use-file-source-sheet';

export type PickedImage = {
  uri: string;
  width: number;
  height: number;
  name?: string;
};

async function pickFromLibrary(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const asset = result.assets[0];
  let width = asset.width ?? 0;
  let height = asset.height ?? 0;
  if (!width || !height) {
    const size = await getImagePixelSize(asset.uri);
    width = size.width;
    height = size.height;
  }
  return {
    uri: asset.uri,
    width,
    height,
    name: asset.fileName ?? undefined,
  };
}

async function pickFromDrive(): Promise<PickedImage | null> {
  const picked = await pickDocumentAsset({ preset: 'image', source: 'drive' });
  if (!picked.ok) {
    if (picked.reason === 'invalid') {
      throw new Error('Please choose an image file.');
    }
    return null;
  }
  const size = await getImagePixelSize(picked.uri);
  return { uri: picked.uri, width: size.width, height: size.height, name: picked.name };
}

/**
 * Ask This Device vs Google Drive, then open the photo library or system file picker.
 * Render `imageSourceSheet` on the same screen.
 */
export function useImageSourcePicker(): {
  pickImageAsset: () => Promise<PickedImage | null>;
  imageSourceSheet: ReactNode;
} {
  const { requestFileSource, fileSourceSheet } = useFileSourceSheet();

  const pickImageAsset = useCallback(async () => {
    try {
      const source = await requestFileSource();
      if (!source) return null;
      // Await here so a picker failure lands in the catch below, not as an unhandled rejection.
      return await (source === 'local' ? pickFromLibrary() : pickFromDrive());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open that image.';
      Alert.alert('Image', message);
      return null;
    }
  }, [requestFileSource]);

  return { pickImageAsset, imageSourceSheet: fileSourceSheet };
}
