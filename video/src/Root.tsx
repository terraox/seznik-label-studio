import { Composition } from 'remotion';
import { Splash, type SplashProps } from './Splash';

export const FPS = 30;
export const DURATION = 78;

const common = { fps: FPS, durationInFrames: DURATION, width: 1080, height: 1920 } as const;

export const Root = () => (
  <>
    <Composition id="SplashWhite" component={Splash} {...common} defaultProps={{ background: 'white' } satisfies SplashProps} />
    <Composition id="SplashGradient" component={Splash} {...common} defaultProps={{ background: 'gradient' } satisfies SplashProps} />
  </>
);
