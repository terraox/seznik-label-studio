import { Composition } from 'remotion';
import { Splash, SPLASH_FPS, SPLASH_FRAMES, SPLASH_SIZE } from './Splash';

const shared = {
  component: Splash,
  durationInFrames: SPLASH_FRAMES,
  fps: SPLASH_FPS,
  width: SPLASH_SIZE,
  height: SPLASH_SIZE,
} as const;

export const Root = () => (
  <>
    <Composition id="Splash" {...shared} defaultProps={{ dark: false }} />
    <Composition id="SplashDark" {...shared} defaultProps={{ dark: true }} />
  </>
);
