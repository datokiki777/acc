import type { ReactNode } from 'react';

import { AppNavigationContext, type AppNavigationContextValue } from './app-navigation-context';

interface AppNavigationProviderProps extends AppNavigationContextValue {
  children: ReactNode;
}

export function AppNavigationProvider({
  children,
  closeAfterSave,
  replaceSheet,
  reportFormDirty,
  requestClose,
}: AppNavigationProviderProps) {
  return (
    <AppNavigationContext.Provider
      value={{ closeAfterSave, replaceSheet, reportFormDirty, requestClose }}
    >
      {children}
    </AppNavigationContext.Provider>
  );
}
