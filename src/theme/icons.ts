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
  | 'star'
  | 'docType'
  | 'duplicate'
  | 'delete'
  | 'select'
  | 'selectAll'
  | 'open'
  | 'archive'
  | 'exportZip'
  | 'gridView'
  | 'listView'
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
  // §17 U9: Review's toolbar and More
  | 'scanMode'
  | 'searchable'
  | 'applyToAll'
  | 'swapSides'
  | 'retakeBack'
  | 'cardSize'
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
  | 'print'
  | 'addToLibrary'
  | 'submit'
  | 'examPack'
  | 'backup'
  | 'restore'
  // Study
  | 'course'
  | 'editCourse'
  | 'deadline'
  | 'timetable'
  // §17 U10: Me's rows
  | 'recognition'
  | 'language'
  | 'fileNames'
  | 'storage'
  | 'exportFolder'
  | 'hideInRecents'
  | 'crashReports'
  | 'usageStats'
  | 'ads'
  | 'theme'
  | 'whatsapp'
  | 'email'
  | 'intro'
  | 'developer'
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
  star: 'star-outline',
  docType: 'pricetag-outline',
  duplicate: 'copy-outline',
  delete: 'trash-outline',
  select: 'checkmark-circle-outline',
  selectAll: 'checkmark-done-outline',
  // §17 U7: Files' row menu, selection bar and toolbar.
  open: 'open-outline',
  archive: 'archive-outline',
  exportZip: 'file-tray-full-outline',
  gridView: 'grid-outline',
  listView: 'reorder-three-outline',

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
  scanMode: 'apps-outline',
  searchable: 'search-circle-outline',
  applyToAll: 'color-fill-outline',
  swapSides: 'swap-horizontal-outline',
  retakeBack: 'camera-reverse-outline',
  cardSize: 'expand-outline',

  find: 'search-outline',
  mark: 'brush-outline',
  sign: 'pencil-outline',
  notes: 'chatbox-ellipses-outline',
  bookmark: 'bookmark-outline',
  contents: 'list-circle-outline',
  readingSettings: 'glasses-outline',

  share: 'share-social-outline',
  save: 'save-outline',
  print: 'print-outline',
  addToLibrary: 'library-outline',
  submit: 'paper-plane-outline',
  examPack: 'school-outline',
  backup: 'cloud-upload-outline',
  restore: 'cloud-download-outline',

  course: 'book-outline',
  editCourse: 'settings-outline',
  deadline: 'alarm-outline',
  timetable: 'calendar-outline',

  recognition: 'scan-circle-outline',
  language: 'language-outline',
  fileNames: 'document-attach-outline',
  storage: 'server-outline',
  exportFolder: 'folder-outline',
  hideInRecents: 'eye-off-outline',
  crashReports: 'bug-outline',
  usageStats: 'stats-chart-outline',
  ads: 'megaphone-outline',
  theme: 'contrast-outline',
  whatsapp: 'logo-whatsapp',
  email: 'mail-outline',
  intro: 'sparkles-outline',
  developer: 'code-slash-outline',

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
