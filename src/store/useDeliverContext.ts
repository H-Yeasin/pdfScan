import { useMemo } from 'react';
import { getCaptureModeSpec } from '../services/capture/captureModes';
import { defaultDocTypeFor, nextTypeNumber } from '../services/courses/docTypes';
import { allowedCover, coverDefaults, withCoverDefaults, type CoverValues } from '../services/pdf/coverTemplates';
import { useIsPro } from '../services/pro/entitlement';
import { institutionLogoUri } from '../services/submit/institutionLogo';
import type { AcademicConfig } from '../services/pdf/pdfService';
import { firstLine, renderText, type NamingContext } from '../services/submit/naming';
import { useAppSlices } from './AppStateContext';
import { useFilingCourse } from './useFilingCourse';

// The scan in Deliver as §4 sees it: the profile, the course it is filed under, its type and
// number ("Assignment 3"), today's date and its first OCR line. Feeds the file name (naming.ts),
// the cover page and the header/footer tokens.
export function useNamingContext(): NamingContext {
  const state = useAppSlices('capture', 'deliver', 'library', 'settings');
  const { courseId } = useFilingCourse();
  const docType = state.deliver.docType ?? defaultDocTypeFor(getCaptureModeSpec(state.capture.mode));
  const { courses, files } = state.library;
  const { profile } = state.settings;
  const title = firstLine(state.capture.pages[0]?.ocr?.text);
  return useMemo(
    () => ({
      profile,
      course: courses.find((c) => c.id === courseId),
      docType,
      n: nextTypeNumber(files, courseId ?? undefined, docType),
      date: new Date(),
      title,
    }),
    [profile, courses, courseId, docType, files, title]
  );
}

// What a cover page shows before the student edits anything. Shared by Deliver (which draws the
// cover) and Academic options (which shows the fields).
export function useCoverDefaults(): CoverValues {
  const ctx = useNamingContext();
  const logoName = useAppSlices('settings').settings.institutionLogo;
  return useMemo(() => coverDefaults({ ...ctx, logoUri: institutionLogoUri(logoName) }), [ctx, logoName]);
}

// deliver.academicConfig as it will be drawn: a template cover's stored edits on top of its
// defaults, and `{name}`, `{roll}`, ... in the header and footer filled in (`{X}`/`{Y}` stay for
// the PDF builder, per page). A Pro cover template (a course preset made while Pro was active)
// is drawn as its free fallback once Pro has ended (§10 M4).
export function useResolvedAcademicConfig(): AcademicConfig | null {
  const state = useAppSlices('capture', 'deliver', 'library', 'settings');
  const stored = state.deliver.academicConfig;
  const ctx = useNamingContext();
  const defaults = useCoverDefaults();
  const isPro = useIsPro();
  return useMemo(() => {
    if (!stored) return null;
    const cover = allowedCover(stored.coverPage, isPro);
    return {
      ...stored,
      headerText: stored.headerText ? renderText(stored.headerText, ctx) || undefined : undefined,
      footerText: stored.footerText ? renderText(stored.footerText, ctx) || undefined : undefined,
      coverPage: cover ? withCoverDefaults(cover, defaults) : undefined,
    };
  }, [stored, ctx, defaults, isPro]);
}
