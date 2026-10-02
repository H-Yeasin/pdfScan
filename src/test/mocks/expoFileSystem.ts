// Disk-backed stand-in for expo-file-system's `File`/`Directory`/`Paths` API, rooted in a fresh
// temp directory per test file. Only the surface this app uses is implemented.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfscan-jest-'));

function toPath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
}

function toUri(p: string, isDir = false): string {
  return `file://${p}${isDir && !p.endsWith('/') ? '/' : ''}`;
}

type PathLike = string | File | Directory;

function joinParts(parts: PathLike[]): string {
  const strings = parts.map((p) => (typeof p === 'string' ? (p.startsWith('file://') ? toPath(p) : p) : toPath(p.uri)));
  return path.join(...strings);
}

export class Directory {
  readonly uri: string;
  constructor(...parts: PathLike[]) {
    this.uri = toUri(joinParts(parts), true);
  }
  get name(): string {
    return path.basename(toPath(this.uri));
  }
  get exists(): boolean {
    const p = toPath(this.uri);
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  }
  create(options?: { intermediates?: boolean; idempotent?: boolean }): void {
    fs.mkdirSync(toPath(this.uri), { recursive: options?.intermediates ?? false });
  }
  // Recursive, like the native getter; null when the directory doesn't exist.
  get size(): number | null {
    if (!this.exists) return null;
    const sum = (p: string): number =>
      fs.readdirSync(p).reduce((total, entry) => {
        const full = path.join(p, entry);
        const stat = fs.statSync(full);
        return total + (stat.isDirectory() ? sum(full) : stat.size);
      }, 0);
    return sum(toPath(this.uri));
  }
  delete(): void {
    fs.rmSync(toPath(this.uri), { recursive: true, force: true });
  }
  list(): (File | Directory)[] {
    const p = toPath(this.uri);
    return fs.readdirSync(p).map((entry) => {
      const full = path.join(p, entry);
      return fs.statSync(full).isDirectory() ? new Directory(full) : new File(full);
    });
  }
  async move(dest: Directory): Promise<void> {
    this.moveSync(dest);
  }
  moveSync(dest: Directory): void {
    const to = toPath(dest.uri);
    fs.mkdirSync(path.dirname(to.replace(/\/$/, '')), { recursive: true });
    fs.renameSync(toPath(this.uri), to);
    (this as { uri: string }).uri = dest.uri;
  }
}

export class File {
  readonly uri: string;
  constructor(...parts: PathLike[]) {
    this.uri = toUri(joinParts(parts));
  }
  get name(): string {
    return path.basename(toPath(this.uri));
  }
  get exists(): boolean {
    const p = toPath(this.uri);
    return fs.existsSync(p) && fs.statSync(p).isFile();
  }
  get size(): number {
    return this.exists ? fs.statSync(toPath(this.uri)).size : 0;
  }
  get lastModified(): number | null {
    return this.exists ? fs.statSync(toPath(this.uri)).mtimeMs : null;
  }
  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(fs.readFileSync(toPath(this.uri)));
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = fs.readFileSync(toPath(this.uri));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  async text(): Promise<string> {
    return fs.readFileSync(toPath(this.uri), 'utf8');
  }
  textSync(): string {
    return fs.readFileSync(toPath(this.uri), 'utf8');
  }
  write(content: string | Uint8Array): void {
    const p = toPath(this.uri);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  create(): void {
    this.write('');
  }
  delete(): void {
    fs.rmSync(toPath(this.uri), { force: true });
  }
  async copy(dest: File | Directory): Promise<void> {
    this.copySync(dest);
  }
  copySync(dest: File | Directory): void {
    const to = dest instanceof Directory ? path.join(toPath(dest.uri), this.name) : toPath(dest.uri);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(toPath(this.uri), to);
  }
  async move(dest: File | Directory): Promise<void> {
    this.moveSync(dest);
  }
  moveSync(dest: File | Directory): void {
    const to = dest instanceof Directory ? path.join(toPath(dest.uri), this.name) : toPath(dest.uri);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(toPath(this.uri), to);
    (this as { uri: string }).uri = toUri(to);
  }
}

export const Paths = {
  document: new Directory(root, 'document'),
  cache: new Directory(root, 'cache'),
  // Settable by tests (§8 B1 space checks); plenty by default.
  availableDiskSpace: 64 * 1024 * 1024 * 1024,
};
fs.mkdirSync(path.join(root, 'document'), { recursive: true });
fs.mkdirSync(path.join(root, 'cache'), { recursive: true });

export const __testRoot = root;
