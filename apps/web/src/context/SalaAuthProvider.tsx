import { useMemo, type ReactNode } from 'react';
import { hasAnyPermission, hasPermission, type ShellUser } from '../auth/permissions';
import {
  SalaAuthContext,
  isStandaloneUnprotectedEnv,
  type SalaAuthContextValue,
} from './SalaAuthContext';

export interface SalaAuthProviderProps {
  user?: ShellUser | null;
  theme?: 'light' | 'dark';
  enforcePermissions?: boolean;
  children: ReactNode;
}

export function SalaAuthProvider({
  user = null,
  theme,
  enforcePermissions,
  children,
}: SalaAuthProviderProps) {
  const isEnforced = enforcePermissions ?? !isStandaloneUnprotectedEnv();

  const value = useMemo<SalaAuthContextValue>(
    () => ({
      user: user ?? null,
      theme,
      isEnforced,
      can: (permission) => (!isEnforced ? true : hasPermission(user, permission)),
      canAny: (permissions) => (!isEnforced ? true : hasAnyPermission(user, permissions)),
    }),
    [user, theme, isEnforced],
  );

  return <SalaAuthContext.Provider value={value}>{children}</SalaAuthContext.Provider>;
}
