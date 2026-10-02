import { SegmentedControl } from '../shared/SegmentedControl';
import { useT } from '../../i18n/useT';
import type { LayoutMode } from '../../services/pdf/pdfService';


type LayoutModeSegmentedProps = {
  value: LayoutMode;
  onChange: (value: LayoutMode) => void;
};

export function LayoutModeSegmented({ value, onChange }: LayoutModeSegmentedProps) {
  const { t } = useT();
  const segments: { id: LayoutMode; label: string }[] = [
    { id: 'standard', label: t('deliver.layout.standard') },
    { id: '2_in_1', label: t('deliver.layout.twoUp') },
  ];
  return <SegmentedControl segments={segments} value={value} onChange={onChange} />;
}
