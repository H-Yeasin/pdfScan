import { useMemo } from 'react';
import { getCaptureModeSpec } from '../services/capture/captureModes';
import { defaultDocTypeFor, nextTypeNumber } from '../services/courses/docTypes';
import { coverDefaults, withCoverDefaults, type CoverValues } from '../services/pdf/coverTemplates';
import type { AcademicConfig } from '../services/pdf/pdfService';
import { firstLine, renderText, type NamingContext } from '../services/submit/naming';
import { useAppState } from './AppStateContext';
import { useFilingCourse } from './useFilingCourse';

// The scan in Deliver as §4 sees it: the profile, the course it is filed under, its type and
// number ("Assignment 3"), today's date and its first OCR line. Feeds the file name (naming.ts),
// the cover page and the header/footer tokens.
export function useNamingContext(): NamingContext {
  const { state } = useAppState();
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
  return useMemo(() => coverDefaults(ctx), [ctx]);
}

// deliver.academicConfig as it will be drawn: a template cover's stored edits on top of its
// defaults, and `{name}`, `{roll}`, ... in the header and footer filled in (`{X}`/`{Y}` stay for
// the PDF builder, per page).
export function useResolvedAcademicConfig(): AcademicConfig | null {
  const { state } = useAppState();
  const stored = state.deliver.academicConfig;
  const ctx = useNamingContext();
  const defaults = useCoverDefaults();
  return useMemo(() => {
    if (!stored) return null;
    return {
      ...stored,
      headerText: stored.headerText ? renderText(stored.headerText, ctx) || undefined : undefined,
      footerText: stored.footerText ? renderText(stored.footerText, ctx) || undefined : undefined,
      coverPage: stored.coverPage ? withCoverDefaults(stored.coverPage, defaults) : undefined,
    };
  }, [stored, ctx, defaults]);
}
