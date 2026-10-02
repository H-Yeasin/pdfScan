/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Services are tested under plain Node: they never render anything, and pdf-lib/pdfjs need
  // Node's TextEncoder/Buffer rather than the react-native environment's stubs.
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '^expo-file-system$': '<rootDir>/src/test/mocks/expoFileSystem.ts',
    '^expo-asset$': '<rootDir>/src/test/mocks/expoAsset.ts',
    '^expo-sqlite$': '<rootDir>/src/test/mocks/expoSqlite.ts',
    '^rn-mlkit-ocr$': '<rootDir>/src/test/mocks/rnMlkitOcr.ts',
    '^expo-haptics$': '<rootDir>/src/test/mocks/expoHaptics.ts',
    '^expo-notifications$': '<rootDir>/src/test/mocks/expoNotifications.ts',
    '^expo-clipboard$': '<rootDir>/src/test/mocks/expoClipboard.ts',
    '^expo-secure-store$': '<rootDir>/src/test/mocks/expoSecureStore.ts',
    '^expo-localization$': '<rootDir>/src/test/mocks/expoLocalization.ts',
    '^@shopify/react-native-skia$': '<rootDir>/src/test/mocks/skia.ts',
    '^react-native-document-scanner-plugin$': '<rootDir>/src/test/mocks/documentScanner.ts',
    '/modules/pdf-native$': '<rootDir>/src/test/mocks/pdfNative.ts',
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
  // Binary assets resolve to their absolute path, which the expo-asset mock hands back as localUri.
  transform: {
    '\\.(ttf|png|jpg)$': '<rootDir>/src/test/assetTransformer.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|pdf-lib|@pdf-lib/.*)',
  ],
};
