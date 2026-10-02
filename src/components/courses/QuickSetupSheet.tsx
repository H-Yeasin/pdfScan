import { useEffect } from 'react';
import { CourseSheet } from './CourseSheet';
import { CourseSetupFields, useCourseSetupForm } from './CourseSetupForm';
import { useT } from '../../i18n/useT';

type QuickSetupSheetProps = {
  visible: boolean;
  onClose: () => void;
};

// "Add your courses": the fast path for a whole term at once (the §3 target is 4 courses in under a
// minute). Name and code only; everything else (emoji, teacher) is in CourseEditorSheet later.
// Opened from the empty course list. The form itself (CourseSetupForm) is shared with §9
// onboarding's "Your courses" page.
export function QuickSetupSheet({ visible, onClose }: QuickSetupSheetProps) {
  const { t } = useT();
  const form = useCourseSetupForm();
  const { reset } = form;

  useEffect(() => {
    if (visible) reset();
  }, [visible, reset]);

  return (
    <CourseSheet
      visible={visible}
      title={t('courses.quickSetup.title')}
      submitLabel={t('courses.quickSetup.submit', { count: Math.max(1, form.count) })}
      submitDisabled={form.count === 0 || (form.attempted && form.anyError)}
      onSubmit={() => {
        if (form.save()) onClose();
      }}
      onClose={onClose}
    >
      <CourseSetupFields form={form} />
    </CourseSheet>
  );
}
