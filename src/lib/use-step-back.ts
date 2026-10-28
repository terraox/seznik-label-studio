import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Makes the system back (Android button, iOS edge swipe) step back inside a multi-step screen,
 * the same as its on-screen Back, instead of leaving the screen for Home.
 * `active` is true while there is an earlier step to return to.
 */
export function useStepBack(active: boolean, stepBack: () => void): void {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !active });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [active, navigation]);

  useEffect(() => {
    if (!active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      stepBack();
      return true;
    });
    return () => sub.remove();
  }, [active, stepBack]);
}
