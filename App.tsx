import { AppProviders } from './src/bootstrap/AppProviders';
import { AppNavigator } from './src/bootstrap/AppNavigator';
import { Snackbar } from './src/components/shared/Snackbar';
// SPIKE SWAP — see src/dev/PdfEngineSpike.tsx. Revert this import + the JSX below once the
// PDF engine validation checklist (plan §2) is done.
import { PdfEngineSpike } from './src/dev/PdfEngineSpike';

const PDF_ENGINE_SPIKE = false;

export default function App() {
  if (PDF_ENGINE_SPIKE) {
    return <PdfEngineSpike />;
  }
  return (
    <AppProviders>
      <AppNavigator />
      <Snackbar />
    </AppProviders>
  );
}
