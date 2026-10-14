import { Composition } from 'remotion';
import { Splash, SPLASH_FPS, SPLASH_FRAMES, SPLASH_SIZE } from './Splash';

export const Root = () => (
  <Composition
    id="Splash"
    component={Splash}
    durationInFrames={SPLASH_FRAMES}
    fps={SPLASH_FPS}
    width={SPLASH_SIZE}
    height={SPLASH_SIZE}
  />
);
