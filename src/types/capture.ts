export type LockState = 'searching' | 'locked' | 'capturing';

export type CapturedPage = {
  uri: string;
  width: number;
  height: number;
  capturedAt: number;
};
