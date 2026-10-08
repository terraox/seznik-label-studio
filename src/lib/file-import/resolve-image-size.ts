import { Image } from 'react-native';

export function getImagePixelSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (!width || !height) {
          reject(new Error('Could not read this image size.'));
          return;
        }
        resolve({ width, height });
      },
      () => reject(new Error('Could not read this image.')),
    );
  });
}
