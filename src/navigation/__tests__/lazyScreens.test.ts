import type { ComponentType } from 'react';
import type { ScreenName } from '../../types/navigation';
import { lazyScreens, type ScreenLoaders } from '../lazyScreens';

// §16 G3: a screen's loader (a `require` of its module in AppNavigator) runs when the screen is
// first read, once.
const loaded: ScreenName[] = [];
const components: Partial<Record<ScreenName, ComponentType>> = {};

const loaders = new Proxy({} as ScreenLoaders, {
  ownKeys: () => ['home', 'library', 'reader'],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  get: (_target, name: ScreenName) => () => {
    loaded.push(name);
    return (components[name] = () => null);
  },
});

describe('lazyScreens', () => {
  const screens = lazyScreens(loaders);

  it('loads nothing when the map is built', () => {
    expect(loaded).toEqual([]);
  });

  it('loads a screen on its first read, and only that screen', () => {
    expect(screens.home).toBe(components.home);
    expect(loaded).toEqual(['home']);
  });

  it('keeps the component, so later reads are the same one', () => {
    const first = screens.reader;
    expect(screens.reader).toBe(first);
    expect(screens.home).toBe(components.home);
    expect(loaded).toEqual(['home', 'reader']);
  });
});
