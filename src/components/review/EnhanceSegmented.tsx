import { SegmentedControl } from '../shared/SegmentedControl';
import type { EnhanceMode } from '../../types/models';

const SEGMENTS: { id: EnhanceMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'color', label: 'Color' },
  { id: 'gray', label: 'Gray' },
  { id: 'bw', label: 'B&W' },
  { id: 'document_scan', label: 'Scan' },
];

type EnhanceSegmentedProps = {
  value: EnhanceMode;
  onChange: (value: EnhanceMode) => void;
};

export function EnhanceSegmented({ value, onChange }: EnhanceSegmentedProps) {
  return <SegmentedControl segments={SEGMENTS} value={value} onChange={onChange} />;
}
