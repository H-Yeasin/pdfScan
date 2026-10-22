import type { Ionicons } from '@expo/vector-icons';

// §17 U1: one icon per action, Ionicons only. Today the same icon means several things (Convert to PDF,
// Add cover and Change cover share one) and some are developer icons (git-merge for Merge); from U2 on
// an action's icon comes from here, so it looks the same on every screen. No two actions share an
// icon (theme/__tests__/tokens.test.ts); a new action is added here first, and the Record's type makes
// a missing one fail the typecheck.
export type IoniconName = keyof typeof Ionicons.glyphMap;

export type ActionId =
  // The shell (U5)
  | 'home'
  | 'files'
  | 'scan'
  | 'tools'
  | 'me'
  // Getting things in
  | 'import'
  | 'camera'
  | 'gallery'
  | 'addPage'
  // Organise
  | 'merge'
  | 'split'
  | 'compress'
  | 'rotate'
  | 'reorder'
  | 'sort'
  | 'filter'
  | 'move'
  | 'rename'
  | 'duplicate'
  | 'delete'
  | 'select'
  | 'selectAll'
  // Convert and edit
  | 'convertToPdf'
  | 'convertToWord'
  | 'extractText'
  | 'copyText'
  | 'addCover'
  | 'changeCover'
  | 'editFile'
  | 'fillForm'
  // Review a scan
  | 'crop'
  | 'enhance'
  | 'adjust'
  | 'undo'
  | 'redo'
  // Read
  | 'find'
  | 'mark'
  | 'sign'
  | 'notes'
  | 'bookmark'
  | 'contents'
  | 'readingSettings'
  // Share and keep
  | 'share'
  | 'save'
  | 'submit'
  | 'examPack'
  | 'backup'
  | 'restore'
  // Study
  | 'course'
  | 'editCourse'
  | 'deadline'
  | 'timetable'
  // App
  | 'settings'
  | 'pro'
  | 'lock'
  | 'help'
  | 'info'
  | 'more'
  | 'back'
  | 'close'
  | 'done';

export const ICONS: Record<ActionId, IoniconName> = {
  home: 'home-outline',
  files: 'folder-open-outline',
  scan: 'scan-outline',
  tools: 'construct-outline',
  me: 'person-circle-outline',

  import: 'download-outline',
  camera: 'camera-outline',
  gallery: 'images-outline',
  addPage: 'add-circle-outline',

  merge: 'albums-outline',
  split: 'cut-outline',
  compress: 'resize-outline',
  rotate: 'refresh-outline',
  reorder: 'reorder-four-outline',
  sort: 'swap-vertical-outline',
  filter: 'funnel-outline',
  move: 'return-up-forward-outline',
  rename: 'text-outline',
  duplicate: 'copy-outline',
  delete: 'trash-outline',
  select: 'checkmark-circle-outline',
  selectAll: 'checkmark-done-outline',

  convertToPdf: 'document-outline',
  convertToWord: 'document-text-outline',
  extractText: 'reader-outline',
  copyText: 'clipboard-outline',
  addCover: 'bookmarks-outline',
  changeCover: 'color-palette-outline',
  editFile: 'create-outline',
  fillForm: 'list-outline',

  crop: 'crop-outline',
  enhance: 'color-wand-outline',
  adjust: 'options-outline',
  undo: 'arrow-undo-outline',
  redo: 'arrow-redo-outline',

  find: 'search-outline',
  mark: 'brush-outline',
  sign: 'pencil-outline',
  notes: 'chatbox-ellipses-outline',
  bookmark: 'bookmark-outline',
  contents: 'list-circle-outline',
  readingSettings: 'glasses-outline',

  share: 'share-social-outline',
  save: 'save-outline',
  submit: 'paper-plane-outline',
  examPack: 'school-outline',
  backup: 'cloud-upload-outline',
  restore: 'cloud-download-outline',

  course: 'book-outline',
  editCourse: 'settings-outline',
  deadline: 'alarm-outline',
  timetable: 'calendar-outline',

  settings: 'cog-outline',
  pro: 'diamond-outline',
  lock: 'lock-closed-outline',
  help: 'help-circle-outline',
  info: 'information-circle-outline',
  more: 'ellipsis-vertical',
  back: 'chevron-back',
  close: 'close',
  done: 'checkmark',
};

// Sizes by role: 22 in a top or bottom bar, 20 in a list row, 16 inline with text.
export const ICON_SIZE = { bar: 22, row: 20, inline: 16 } as const;
