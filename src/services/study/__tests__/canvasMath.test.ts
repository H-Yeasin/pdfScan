import { canvasToMaster, masterToLayer, pageFit } from '../canvasMath';

describe('PageCanvas geometry', () => {
  const page = { width: 2000, height: 2800 };
  const canvas = { width: 400, height: 800 };
  const fit = pageFit(page, canvas);

  it('fits the page and maps master boxes into the layer', () => {
    expect(fit.scale).toBeCloseTo(0.2);
    expect(masterToLayer({ left: 1000, top: 0, width: 500, height: 100 }, fit)).toEqual({
      left: 200,
      top: fit.origin.y,
      width: 100,
      height: 20,
    });
  });

  it('a touch maps back to the same master point, unzoomed and zoomed', () => {
    const master = { x: 1500, y: 700 };
    const layer = masterToLayer({ left: master.x, top: master.y, width: 0, height: 0 }, fit);
    expect(canvasToMaster({ x: layer.left, y: layer.top }, fit, canvas, { scale: 1, tx: 0, ty: 0 })).toEqual(master);

    // Zoomed 2x about the centre and moved: where the point appears on screen.
    const t = { scale: 2, tx: -50, ty: 30 };
    const screen = { x: (layer.left - 200) * 2 + 200 - 50, y: (layer.top - 400) * 2 + 400 + 30 };
    const back = canvasToMaster(screen, fit, canvas, t);
    expect(back.x).toBeCloseTo(master.x);
    expect(back.y).toBeCloseTo(master.y);
  });
});
