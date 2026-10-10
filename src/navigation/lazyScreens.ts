import type { ComponentType } from 'react';
import type { ScreenName } from '../types/navigation';
import type { ScreenMap } from './ScreenStack';

// §16 G3: a screen's module, and everything it imports, loads when the screen first renders
// instead of with the app. Each loader is a synchronous `require`, so the router and ScreenStack
// stay synchronous: no React.lazy, no Suspense fallback flashing in during a slide. A loader runs
// on the first read of its screen and the component is kept, so ScreenStack's memoised layers
// always see the same component.
export type ScreenLoaders = Record<ScreenName, () => ComponentType>;

export function lazyScreens(loaders: ScreenLoaders): ScreenMap {
  const screens = {} as ScreenMap;
  for (const name of Object.keys(loaders) as ScreenName[]) {
    let screen: ComponentType | undefined;
    Object.defineProperty(screens, name, { enumerable: true, get: () => (screen ??= loaders[name]()) });
  }
  return screens;
}
