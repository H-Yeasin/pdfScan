import { AppProviders } from './src/bootstrap/AppProviders';
import { AppNavigator } from './src/bootstrap/AppNavigator';
import { Snackbar } from './src/components/shared/Snackbar';
// SPIKE SWAP — see src/dev/PdfEngineSpike.tsx. Revert this import + the JSX below once the
// PDF engine validation checklist (plan §2) is done.
import { PdfEngineSpike } from './src/dev/PdfEngineSpike';
// SPIKE SWAP — see src/dev/DocFormatSpike.tsx. Revert this import + the JSX below once the
// universal-reader native spike checklist (plan what-if-this-app-glistening-valley.md §Phase 2) is done.
import { DocFormatSpike } from './src/dev/DocFormatSpike';

const PDF_ENGINE_SPIKE = false;
const DOC_FORMAT_SPIKE = false;

export default function App() {
  if (PDF_ENGINE_SPIKE) {
    return <PdfEngineSpike />;
  }
  if (DOC_FORMAT_SPIKE) {
    return <DocFormatSpike />;
  }
  return (
    <AppProviders>
      <AppNavigator />
      <Snackbar />
    </AppProviders>
  );
}
