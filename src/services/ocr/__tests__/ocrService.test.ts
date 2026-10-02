import MlkitOcr from 'rn-mlkit-ocr';
import { FAKE_SCRIPT_ID, fakeOcr, fakeScript, installFakeScript, type FakeEngine } from '../../../test/fakeScript';
import type { OcrScript } from '../../../types/models';
import { recognizePage, runOcr } from '../ocrService';

const recognizeText = MlkitOcr.recognizeText as jest.Mock;

beforeEach(() => recognizeText.mockClear());

describe('runOcr with ML Kit', () => {
  it("passes the registry entry's ML Kit model", async () => {
    await runOcr('file:///page.jpg', 'chinese');
    expect(recognizeText).toHaveBeenCalledWith('file:///page.jpg', 'chinese');
  });

  it('maps blocks, lines and word boxes', async () => {
    const frame = { x: 1, y: 2, width: 3, height: 4 };
    recognizeText.mockResolvedValueOnce({
      text: 'Hi there',
      blocks: [{ text: 'Hi there', frame, lines: [{ text: 'Hi there', frame, elements: [{ text: 'Hi', frame }] }] }],
    });
    const bounding = { left: 1, top: 2, width: 3, height: 4 };
    expect(await runOcr('file:///page.jpg', 'latin')).toEqual({
      text: 'Hi there',
      blocks: [{ text: 'Hi there', bounding, lines: [{ text: 'Hi there', bounding, words: [{ text: 'Hi', bounding }] }] }],
    });
  });

  it('reads an empty page as no text, not a failure', async () => {
    expect(await runOcr('file:///page.jpg', 'latin')).toEqual({ text: '', blocks: [] });
  });

  it('stays best-effort when ML Kit throws', async () => {
    recognizeText.mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
    expect(await recognizePage('file:///page.jpg', 'latin')).toEqual({ ocrFailed: true, reason: 'error' });
  });

  it('refuses a planned script (Bangla has no engine yet) and an unknown one', async () => {
    expect(await recognizePage('file:///page.jpg', 'bengali')).toEqual({ ocrFailed: true, reason: 'unsupported' });
    expect(await runOcr('file:///page.jpg', 'klingon' as OcrScript)).toBeUndefined();
    expect(recognizeText).not.toHaveBeenCalled();
  });
});

describe('runOcr dispatch by engine', () => {
  let engine: FakeEngine;
  let uninstall: () => void;
  beforeEach(() => ({ engine, uninstall } = installFakeScript()));
  afterEach(() => uninstall());

  it("hands the page to the script's own engine, never ML Kit", async () => {
    expect(await runOcr('file:///page.jpg', FAKE_SCRIPT_ID)).toEqual(fakeOcr());
    expect(engine.recognize).toHaveBeenCalledWith('file:///page.jpg', fakeScript);
    expect(recognizeText).not.toHaveBeenCalled();
  });

  it("says 'model-missing' when the engine doesn't have the model, without recognising", async () => {
    engine.isAvailable.mockResolvedValueOnce(false);
    expect(await recognizePage('file:///page.jpg', FAKE_SCRIPT_ID)).toEqual({ ocrFailed: true, reason: 'model-missing' });
    expect(engine.recognize).not.toHaveBeenCalled();
  });

  it('stays best-effort when the engine throws', async () => {
    engine.recognize.mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
    expect(await runOcr('file:///page.jpg', FAKE_SCRIPT_ID)).toBeUndefined();
  });

  it('is gone again after uninstalling', async () => {
    uninstall();
    expect(await recognizePage('file:///page.jpg', FAKE_SCRIPT_ID)).toEqual({ ocrFailed: true, reason: 'unsupported' });
    ({ engine, uninstall } = installFakeScript());
  });
});
