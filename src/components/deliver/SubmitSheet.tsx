import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useT } from '../../i18n/useT';
import type { LayoutMode } from '../../services/pdf/pdfService';
import type { PageSizeId } from '../../services/pdf/pageSize';
import { formatLimit } from '../../services/submit/sizeFormat';
import { ICONS, spacing } from '../../theme';
import type { Course } from '../../types/models';
import { SegmentedControl } from '../shared/SegmentedControl';
import { appear, Button, disappear, ListItem, settle, Sheet, Text } from '../ui';
import { LayoutModeSegmented } from './LayoutModeSegmented';
import { NameField } from './NameField';
import { SizeTargetRow } from './SizeTargetRow';

// §17 U9: the teacher's copy, out of the Save screen (it was the "Submission" card there): cover,
// size target, file name, page layout and size, marks, and "Remember for {course}" (the course's
// submit preset, submit/preset.ts). Changes apply at once, as they did on the card; Submit saves
// the scan, then shares the named file (DeliverScreen's handleSubmit).

type SubmitSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  // The filing course; undefined for Unsorted, which has no preset to remember.
  course: Course | undefined;
  academicSummary: string;
  onAcademic: () => void;
  sizeLimitBytes: number | null;
  onSizeLimit: (bytes: number | null) => void;
  // The course's own file-name template ('' = the Settings one, shown as the placeholder).
  nameTemplate: string;
  defaultTemplate: string;
  onNameTemplate: (template: string) => void;
  layoutMode: LayoutMode;
  onLayoutMode: (mode: LayoutMode) => void;
  pageSize: PageSizeId;
  onPageSize: (size: PageSizeId) => void;
  includeAnnotations: boolean;
  onIncludeAnnotations: (include: boolean) => void;
  rememberPreset: boolean;
  onRememberPreset: (remember: boolean) => void;
};

export function SubmitSheet(props: SubmitSheetProps) {
  const { t } = useT();
  const { course } = props;
  const courseLabel = course ? course.code || course.name : undefined;

  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title={courseLabel ? t('deliver.submitSheet.titleCourse', { course: courseLabel }) : t('deliver.submitSheet.title')}
      testID="submit-sheet"
      footer={
        <>
          <Button label={t('common.cancel')} variant="ghost" onPress={props.onClose} />
          <Button label={t('deliver.actions.submit')} icon={ICONS.submit} onPress={props.onSubmit} accessibilityLabel={t('deliver.actions.submitA11y')} testID="submit-sheet-submit" />
        </>
      }
    >
      <Text variant="caption" color="muted">
        {t('deliver.submitSheet.hint')}
      </Text>

      <ListItem title={t('deliver.academicRow')} subtitle={props.academicSummary} icon={ICONS.addCover} trailing={'chevron'} onPress={props.onAcademic} />

      <View style={styles.group}>
        <View style={styles.labelRow}>
          <Text variant="label">{t('deliver.fileSize')}</Text>
          {props.sizeLimitBytes !== null ? (
            <Animated.View entering={appear} exiting={disappear}>
              <Text variant="caption" color="accentInk">
                {t('deliver.willBeAtMost', { size: formatLimit(props.sizeLimitBytes) })}
              </Text>
            </Animated.View>
          ) : null}
        </View>
        <SizeTargetRow value={props.sizeLimitBytes} onChange={props.onSizeLimit} />
      </View>

      {course ? (
        <NameField
          label={t('deliver.courseTemplate', { course: courseLabel! })}
          value={props.nameTemplate}
          onChange={props.onNameTemplate}
          placeholder={props.defaultTemplate}
          helperText={t('deliver.courseTemplateHint')}
        />
      ) : null}

      {/* §17 U13: the 2-per-sheet hint fades in, and what is below it slides down to make room. */}
      <Animated.View layout={settle} style={styles.group}>
        <Text variant="label">{t('deliver.pageLayout')}</Text>
        <LayoutModeSegmented value={props.layoutMode} onChange={props.onLayoutMode} />
        {props.layoutMode === '2_in_1' ? (
<<<<<<< HEAD
          <Animated.View entering={appear} exiting={disappear}>
            <Text variant="caption" color="muted">
              {t('deliver.layoutHintTwoUp')}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>
=======
          <Text variant="caption" color="muted">
            {t('deliver.layoutHintTwoUp')}
          </Text>
        ) : null}
      </View>
>>>>>>> cdf4e51af426899ebf6ab775e6bb3ccc9e081ca4

      <Animated.View layout={settle} style={styles.group}>
        <Text variant="label">{t('deliver.pageSize')}</Text>
        <SegmentedControl
          segments={[
            { id: 'A4' as PageSizeId, label: 'A4' },
            { id: 'Letter' as PageSizeId, label: t('deliver.paperLetter') },
          ]}
          value={props.pageSize}
          onChange={props.onPageSize}
        />
      </Animated.View>

      <ListItem
        title={t('deliver.includeAnnotations')}
        subtitle={t('deliver.includeAnnotationsHint')}
        switchValue={props.includeAnnotations}
        onValueChange={props.onIncludeAnnotations}
      />
      {course ? (
        <ListItem
          title={t('deliver.remember', { course: courseLabel! })}
          subtitle={t('deliver.rememberHint')}
          switchValue={props.rememberPreset}
          onValueChange={props.onRememberPreset}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
