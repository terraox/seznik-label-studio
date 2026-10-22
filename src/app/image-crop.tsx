import { goBack } from '@/lib/go-back';
import { router, useLocalSearchParams } from 'expo-router';

import { ImageCropScreen } from '@/components/editor/image-crop-screen';
import { editorBridge } from '@/constants/editor-bridge';

export default function ImageCropRoute() {
  const params = useLocalSearchParams<{
    uri?: string;
    width?: string;
    height?: string;
    mode?: string;
    elementId?: string;
  }>();

  const uri = typeof params.uri === 'string' ? params.uri : '';
  const width = Number(params.width ?? 0);
  const height = Number(params.height ?? 0);
  const mode = params.mode === 'replace' || params.mode === 'recrop' ? params.mode : 'import';
  const elementId = typeof params.elementId === 'string' ? params.elementId : undefined;

  if (!uri) {
    goBack();
    return null;
  }

  return (
    <ImageCropScreen
      sourceUri={uri}
      sourceWidth={width > 0 ? width : undefined}
      sourceHeight={height > 0 ? height : undefined}
      onCancel={() => goBack()}
      onDone={(result) => {
        editorBridge.imageCropResult = {
          uri: result.uri,
          width: result.width,
          height: result.height,
          mode,
          elementId,
          crop: result.crop,
        };
        goBack();
      }}
    />
  );
}
