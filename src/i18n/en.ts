import type { CatalogShape } from './types';

// The English catalog: every UI string the app shows, nested by area (§6 L4). Values are strings
// or { one, other } plurals; `{name}` is a parameter. Screens read it through t() / useT(); other
// languages (bn.ts later) must have exactly these keys. Areas are filled as screens are converted
// (L4a: settings and home; L4b-d: the rest).
export const en = {
  meta: {
    locale: 'en',
    nativeName: 'English',
    plural: (count: number) => (count === 1 ? 'one' : 'other'),
  },

  common: {
    cancel: 'Cancel',
    edit: 'Edit',
    notSet: 'Not set',
    unsorted: 'Unsorted',
    scan: 'Scan',
    settings: 'Settings',
    back: 'Back',
    active: 'Active',
    select: 'Select',
    comingSoon: 'Coming soon',
    comingSoonA11y: 'Coming soon: {name}',
    today: 'Today',
    yesterday: 'Yesterday',
    daysAgo: { one: '{count} day ago', other: '{count} days ago' },
    bytes: { kb: '{size} KB', mb: '{size} MB' },
  },

  home: {
    yourCourses: 'Your courses',
    semesterA11y: 'Semester: {name}. Change',
    continueReading: 'Continue reading',
    latestScan: 'Latest scan',
    dueSoon: 'Due soon',
    addDeadline: '+ Add deadline',
    nothingDue: 'Nothing due in the next 7 days.',
    emptyTitle: 'Add your courses',
    emptyBody: "Each scan gets filed under a course, so a subject's notes and handouts stay together.",
    emptyButton: 'Add your courses',
    docCount: { one: '{count} doc', other: '{count} docs' },
    noScansYet: 'No scans yet',
    addCourse: 'Add course',
    unsortedCount: 'Unsorted ({count})',
    courseHint: 'Long-press to edit, reorder or archive',
    moveEarlier: 'Move earlier',
    moveLater: 'Move later',
    archive: 'Archive',
    archived: '{name} archived',
  },

  settings: {
    title: 'Settings',
    profile: {
      section: 'Profile',
      name: 'Full name',
      namePlaceholder: 'e.g. Rahim Uddin',
      roll: 'Roll / student ID',
      rollPlaceholder: 'e.g. 2021331045',
      sectionField: 'Section',
      sectionPlaceholder: 'e.g. B',
      institution: 'Institution',
      institutionPlaceholder: 'e.g. SUST',
      footnote: 'Stored only on this phone. Used for file names, cover pages and footers.',
    },
    fileNames: {
      section: 'File names',
      template: 'Naming template',
      insertToken: 'Insert {token}',
      example: 'Example: {name}',
      exampleEmpty: 'Example: (empty: scans are named Scan_<date>)',
      reset: 'Reset to {template}',
      footnote:
        'Used to name new scans in Deliver. Without a name and roll in your profile, the default becomes {fallback}. Empty parts are left out.',
      sampleCourse: 'Physics',
      sampleTitle: "Ohm's law",
    },
    appearance: 'Appearance',
    theme: { system: 'System', light: 'Light', dark: 'Dark' },
    language: {
      section: 'App language',
      system: 'Phone language ({name})',
      pseudo: 'Pseudo-locale (developer)',
    },
    recognition: {
      section: 'Recognition language',
      footnote:
        'Recognition runs fully on-device and makes your scans searchable. Pick the script your documents are written in; a course can use its own (edit the course). Devanagari also covers Sanskrit.',
    },
    organization: {
      section: 'Organization',
      manageCourses: 'Manage courses',
      manageCoursesSubtitle: 'Create, rename, and organize your courses',
      classTimes: 'Class times',
      classTimesSubtitle: 'Scans during a class are saved to that course',
      classCount: { one: '{count} class', other: '{count} classes' },
    },
    export: {
      section: 'Export',
      folder: 'Default export folder',
      folderSubtitle: 'Copy exported files here automatically',
      folderHint: 'Turn on "Also save a copy" in Deliver to write exports here too.',
      noFolder: 'No folder selected',
    },
    scanner: {
      section: 'Scanner',
      basicMode: 'Basic camera mode',
      basicModeSubtitle:
        "Google's scanner wasn't available on this phone. Tap to try it again (e.g. after updating Google Play services).",
      retrySnack: "The next scan will try Google's scanner",
    },
    developer: {
      section: 'Developer',
      filterLab: 'Filter Lab',
      filterLabSubtitle: 'Compare every filter and tune its constants',
    },
    privacy: {
      section: 'Privacy',
      crashReports: 'Send anonymous crash reports',
      crashReportsSubtitle: 'Never includes your documents, names or scanned text.',
    },
    about: {
      section: 'About',
      text: 'Version {version} · Documents never leave your phone unless you share them.',
    },
  },

  capture: {},
  review: {},
  deliver: {},
  submit: {},
  library: {},
  reader: {},
  courses: {},
  errors: {},
} satisfies CatalogShape;
