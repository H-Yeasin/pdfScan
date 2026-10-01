import type { SessionPage } from '../types/models';

// Shows a page's pending (not yet rendered) rotation on an <Image> of its unrotated master.
export function rotationStyle(rotation: SessionPage['rotation']) {
  return rotation ? { transform: [{ rotate: `${rotation}deg` }] } : null;
}
