// Under Jest, `require('asset.ttf')` is the asset's absolute path (see assetTransformer.js).
export class Asset {
  localUri: string | null = null;
  private constructor(private readonly path: string) {}
  static fromModule(mod: unknown): Asset {
    return new Asset(String(mod));
  }
  async downloadAsync(): Promise<this> {
    this.localUri = `file://${this.path}`;
    return this;
  }
}
