// In-memory clipboard for tests.
let clipboard = '';
export async function setStringAsync(text: string): Promise<boolean> {
  clipboard = text;
  return true;
}
export async function getStringAsync(): Promise<string> {
  return clipboard;
}
