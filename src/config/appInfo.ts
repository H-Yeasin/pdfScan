import appJson from '../../app.json';

// The app's version as set in app.json, for backup manifests (§8 B3) and anything else that
// needs to say which version made something.
export const APP_VERSION: string = appJson.expo.version;
