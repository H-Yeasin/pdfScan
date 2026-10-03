import {
  ID_CANVAS_HEIGHT,
  ID_CANVAS_WIDTH,
  cardSlot,
  idCardPlacements,
  mmToPx,
} from '../idCardLayout';
import type { BoxFit } from '../../../utils/fitBox';

describe('ID card layout at 200 dpi', () => {
  it('uses an A4 canvas of 1654 x 2339 px', () => {
    expect([ID_CANVAS_WIDTH, ID_CANVAS_HEIGHT]).toEqual([1654, 2339]);
  });

  it('gives a landscape card a true-size ID-1 slot, centred, front at 25 % and back at 60 %', () => {
    const { front, back } = idCardPlacements({ width: 1712, height: 1080 }, { width: 1712, height: 1080 });
    // 85.6 x 54 mm at 200 dpi = 674.0 x 425.2 px. A scan with the card's own aspect fills it.
    expect(front.width).toBeCloseTo(674.0, 0);
    expect(front.height).toBeCloseTo(425.2, 0);
    expect(front.origin.x + front.width / 2).toBeCloseTo(ID_CANVAS_WIDTH / 2, 5);
    expect(front.origin.y + front.height / 2).toBeCloseTo(ID_CANVAS_HEIGHT * 0.25, 5);
    expect(back!.origin.y + back!.height / 2).toBeCloseTo(ID_CANVAS_HEIGHT * 0.6, 5);
    // Cards never overlap.
    expect(front.origin.y + front.height).toBeLessThan(back!.origin.y);
  });

  it('works without a back', () => {
    const placements = idCardPlacements({ width: 1712, height: 1080 });
    expect(placements.back).toBeUndefined();
    expect(placements.front.width).toBeCloseTo(674, 0);
  });

  it('gives a portrait (vertical) card a portrait slot', () => {
    const slot = cardSlot({ width: 1080, height: 1712 }, 0.25);
    expect(slot.width).toBeCloseTo(425.2, 0);
    expect(slot.height).toBeCloseTo(674.0, 0);
    const { front } = idCardPlacements({ width: 1080, height: 1712 });
    expect(front.width).toBeCloseTo(425.2, 0);
  });

  it('never stretches a loosely cropped scan', () => {
    // A 4:3 photo of a card: fit by height inside the slot, aspect preserved.
    const { front } = idCardPlacements({ width: 1600, height: 1200 });
    expect(front.width / front.height).toBeCloseTo(4 / 3, 5);
    expect(front.height).toBeCloseTo(mmToPx(54), 0);
  });
});

describe('ID card layout, large', () => {
  const inside = (box: BoxFit) => {
    expect(box.origin.x).toBeGreaterThanOrEqual(0);
    expect(box.origin.y).toBeGreaterThanOrEqual(0);
    expect(box.origin.x + box.width).toBeLessThanOrEqual(ID_CANVAS_WIDTH);
    expect(box.origin.y + box.height).toBeLessThanOrEqual(ID_CANVAS_HEIGHT);
  };

  it('fills ~85 % of the page width with a landscape card, centred', () => {
    const { front, back } = idCardPlacements({ width: 1712, height: 1080 }, { width: 1712, height: 1080 }, 'large');
    expect(front.width).toBeCloseTo(ID_CANVAS_WIDTH * 0.85, 0);
    expect(front.origin.x + front.width / 2).toBeCloseTo(ID_CANVAS_WIDTH / 2, 5);
    expect(back!.width).toBeCloseTo(front.width, 5);
  });

  it("doesn't shrink a squarish scan to a card outline", () => {
    const scan = { width: 1600, height: 1500 };
    const real = idCardPlacements(scan).front;
    const large = idCardPlacements(scan, scan, 'large');
    expect(large.front.width).toBeGreaterThan(real.width * 2);
    expect(large.front.width / large.front.height).toBeCloseTo(1600 / 1500, 5);
  });

  it('keeps both sides on the page without overlapping, portrait or landscape', () => {
    for (const source of [{ width: 1712, height: 1080 }, { width: 1080, height: 1712 }, { width: 1600, height: 1500 }]) {
      const { front, back } = idCardPlacements(source, source, 'large');
      inside(front);
      inside(back!);
      expect(front.origin.y + front.height).toBeLessThan(back!.origin.y);
    }
  });
});
