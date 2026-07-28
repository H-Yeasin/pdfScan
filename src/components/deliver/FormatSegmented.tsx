import { SegmentedControl } from '../shared/SegmentedControl';
import type { DocFormat } from '../../types/models';

const SEGMENTS: { id: DocFormat; label: string }[] = [
  { id: 'PDF', label: 'PDF' },
  { id: 'JPG', label: 'JPG' },
];

type FormatSegmentedProps = {
  value: DocFormat;
  onChange: (value: DocFormat) => void;
};

export function FormatSegmented({ value, onChange }: FormatSegmentedProps) {
  return <SegmentedControl segments={SEGMENTS} value={value} onChange={onChange} />;
}
