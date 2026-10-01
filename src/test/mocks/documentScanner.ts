// react-native-document-scanner-plugin ships an ESM build and a native TurboModule; tests that
// scan mock it with jest.mock(). This stub only lets importing modules load.
export enum ResponseType {
  Base64 = 'base64',
  ImageFilePath = 'imageFilePath',
}
export enum ScanDocumentResponseStatus {
  Success = 'success',
  Cancel = 'cancel',
}
const DocumentScanner = {
  scanDocument: jest.fn(async () => ({ status: ScanDocumentResponseStatus.Cancel })),
};
export default DocumentScanner;
