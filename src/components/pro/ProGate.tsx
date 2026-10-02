import type { ReactNode } from 'react';
import { useProFeature } from '../../services/pro/entitlement';
import type { ProFeatureId, ProUse } from '../../services/pro/proFeatures';

type ProGateProps = {
  feature: ProFeatureId;
  // 'keep' for something set up while Pro was active (see LapseRule); 'start' for anything new.
  use?: ProUse;
  // Shown instead without Pro: usually the feature with a ProBadge that offers the pass (M6).
  fallback?: ReactNode;
  children: ReactNode;
};

// §10 M3: renders its children only when the feature can be used now.
export function ProGate({ feature, use = 'start', fallback = null, children }: ProGateProps) {
  return <>{useProFeature(feature, use) ? children : fallback}</>;
}
