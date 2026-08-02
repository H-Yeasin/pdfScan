import { SegmentedControl } from '../shared/SegmentedControl';
import type { LayoutMode } from '../../services/pdf/pdfService';

const SEGMENTS: { id: LayoutMode; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: '2_in_1', label: 'Eco-Save (2-up)' },
];

type LayoutModeSegmentedProps = {
  value: LayoutMode;
  onChange: (value: LayoutMode) => void;
};

export function LayoutModeSegmented({ value, onChange }: LayoutModeSegmentedProps) {
  return <SegmentedControl segments={SEGMENTS} value={value} onChange={onChange} />;
}
