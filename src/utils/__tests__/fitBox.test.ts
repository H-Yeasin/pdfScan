import { fitBox } from '../fitBox';

describe('fitBox', () => {
  it('scales a tall image to the box height and centers it horizontally', () => {
    const fit = fitBox(1000, 2000, 0, 0, 500, 500);
    expect(fit.scale).toBeCloseTo(0.25);
    expect(fit.width).toBeCloseTo(250);
    expect(fit.height).toBeCloseTo(500);
    expect(fit.origin).toEqual({ x: 125, y: 0 });
  });

  it('scales a wide image to the box width and centers it vertically, honoring the box offset', () => {
    const fit = fitBox(2000, 1000, 10, 20, 400, 400);
    expect(fit.scale).toBeCloseTo(0.2);
    expect(fit.origin.x).toBeCloseTo(10);
    expect(fit.origin.y).toBeCloseTo(20 + (400 - 200) / 2);
  });

  it('upscales content smaller than the box', () => {
    expect(fitBox(100, 100, 0, 0, 300, 600).scale).toBeCloseTo(3);
  });
});
