import { createContext, useContext } from 'react';
import { PermisoSala, type ShellUser } from '../auth/permissions';

export * from './SalaAuthProvider';

export interface SalaAuthContextValue {
  user: ShellUser | null;
  theme?: 'light' | 'dark';
  isEnforced: boolean;
  can: (permission: PermisoSala | string) => boolean;
  canAny: (permissions: readonly (PermisoSala | string)[]) => boolean;
}

export function isStandaloneUnprotectedEnv(): boolean {
  return import.meta.env.MODE === 'test' || import.meta.env.VITE_USE_MOCKS === 'true';
}

const defaultSalaAuthValue: SalaAuthContextValue = {
  user: null,
  theme: undefined,
  get isEnforced() {
    return !isStandaloneUnprotectedEnv();
  },
  can: () => isStandaloneUnprotectedEnv(),
  canAny: () => isStandaloneUnprotectedEnv(),
};

export const SalaAuthContext = createContext<SalaAuthContextValue>(defaultSalaAuthValue);

export function useSalaAuth(): SalaAuthContextValue {
  return useContext(SalaAuthContext);
}
