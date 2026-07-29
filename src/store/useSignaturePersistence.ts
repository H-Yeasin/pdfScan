import { useEffect } from 'react';
import { loadSavedSignature } from '../services/signature/savedSignatureStorage';
import { useAppState } from './AppStateContext';

export function useSignaturePersistence() {
  const { dispatch } = useAppState();

  useEffect(() => {
    loadSavedSignature().then((saved) => {
      if (saved) dispatch({ type: 'signature/SET_SAVED', saved });
    });
  }, [dispatch]);
}
