// Shows a page's turn on an <Image> of its unturned picture: a Review page's pending (not yet
// rendered) rotation, or a library page's turn after saving (§7 R3) on its thumbnail - never a
// re-encode.
export function rotationStyle(rotation: number | undefined) {
  return rotation ? { transform: [{ rotate: `${rotation}deg` }] } : null;
}
