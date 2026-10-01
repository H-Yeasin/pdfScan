// Silences the expected console.warn noise from best-effort code paths under test; individual
// tests that care about a warning spy on console.warn themselves.
jest.spyOn(console, 'warn').mockImplementation(() => {});
