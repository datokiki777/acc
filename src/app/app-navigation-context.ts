import { createContext } from 'react';

import type { SheetName } from '../store/app-store';

export interface AppNavigationContextValue {
  closeAfterSave: () => void;
  /** Swap the open sheet for another one in place — Back then skips the one that was replaced. */
  replaceSheet: (sheet: SheetName, personId: string | null) => void;
  reportFormDirty: (dirty: boolean) => void;
  requestClose: () => void;
}

export const AppNavigationContext = createContext<AppNavigationContextValue | null>(null);
