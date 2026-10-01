import { SegmentedControl } from '../shared/SegmentedControl';
import { FILTERS } from '../../services/enhance/filters/registry';
import type { EnhanceMode } from '../../types/models';

// Driven by the filter registry; filters whose pipeline isn't built yet (available: false) are hidden.
const SEGMENTS: { id: EnhanceMode; label: string }[] = FILTERS.filter((spec) => spec.available).map((spec) => ({
  id: spec.id,
  label: spec.label,
}));

type EnhanceSegmentedProps = {
  value: EnhanceMode;
  onChange: (value: EnhanceMode) => void;
};

export function EnhanceSegmented({ value, onChange }: EnhanceSegmentedProps) {
  return <SegmentedControl segments={SEGMENTS} value={value} onChange={onChange} />;
}
