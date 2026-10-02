import { useEffect } from 'react';
import { loadSavedSignature } from '../services/signature/savedSignatureStorage';
import { useAppDispatch } from './AppStateContext';

export function useSignaturePersistence() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    loadSavedSignature().then((saved) => {
      if (saved) dispatch({ type: 'signature/SET_SAVED', saved });
    });
  }, [dispatch]);
}
