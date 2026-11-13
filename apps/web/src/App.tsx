import './index.css';
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { QueryClientContext, QueryClientProvider } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { setFederatedToken } from './api/client';
import { queryClient } from './api/queryClient';
import {
  AUTH_SESSION_STORAGE_KEY,
  PermisoSala,
  decodeJwtUser,
  getStoredSession,
  type FederatedModuleProps,
  type StoredShellSession,
} from './auth/permissions';
import { SalaAuthProvider, useSalaAuth } from './context/SalaAuthContext';
import { SalaSocketContext, SalaSocketProvider } from './context/SalaSocketContext';
import { useSalaSocket } from './hooks';
import { AdministracionMesasView, ListaEsperaView, PlanoSalaView, ReservasView } from './views';

type VistaSala = 'plano' | 'reservas' | 'mesas' | 'espera';

interface TabItem {
  key: VistaSala;
  label: string;
  anyPermissions: readonly PermisoSala[];
}

const TAB_ITEMS: readonly TabItem[] = [
  { key: 'plano', label: 'Plano de sala', anyPermissions: [PermisoSala.TABLES_VIEW] },
  { key: 'reservas', label: 'Reservas', anyPermissions: [PermisoSala.RESERVATIONS_VIEW] },
  {
    key: 'mesas',
    label: 'Configuración de mesas',
    anyPermissions: [
      PermisoSala.TABLES_CREATE,
      PermisoSala.TABLES_UPDATE,
      PermisoSala.TABLES_DELETE,
    ],
  },
  { key: 'espera', label: 'Lista de espera', anyPermissions: [PermisoSala.WAITLIST_ENTRIES_VIEW] },
];

function getDevEnvToken(): string | null {
  if (import.meta.env.MODE === 'test') {
    return null;
  }
  const token = import.meta.env.VITE_DEV_AUTH_TOKEN;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function TokenSync({ token }: { readonly token: string | null | undefined }) {
  if (token !== undefined) {
    setFederatedToken(token);
  }
  useEffect(() => {
    if (token !== undefined) {
      setFederatedToken(token);
    }
    return () => {
      if (token !== undefined) {
        setFederatedToken(null);
      }
    };
  }, [token]);

  return null;
}

function SalaContent({
  theme,
  isEmbedded,
}: {
  readonly theme?: 'light' | 'dark';
  readonly isEmbedded: boolean;
}) {
  const { isConnected } = useSalaSocket();
  const { canAny } = useSalaAuth();
  const id = useId();
  const [view, setView] = useState<VistaSala>('plano');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((item) => canAny(item.anyPermissions)),
    [canAny],
  );

  const activeView: VistaSala | null = useMemo(() => {
    if (visibleTabs.length === 0) {
      return null;
    }
    return visibleTabs.some((item) => item.key === view) ? view : visibleTabs[0].key;
  }, [visibleTabs, view]);

  return (
    <div
      data-theme={theme}
      className={`sala-module-scope sala-module-root text-text ${isEmbedded ? 'min-h-full flex-1' : 'min-h-screen'}`}
    >
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="bg-surface border border-border rounded-card p-6 shadow-subtle flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">Control de Sala</h1>
              <span className="text-xs bg-primary-soft text-primary font-semibold px-2.5 py-0.5 rounded-full border border-primary/20">
                v1.0.0
              </span>
              {isConnected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>En vivo</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Reconectando</span>
                </span>
              )}
            </div>
            <p className="text-sm text-muted mt-1">
              Gestión de Sala, Mesas y Reservas en tiempo real
            </p>
          </div>
        </header>

        <main>
          {activeView === null ? (
            <section
              role="alert"
              data-testid="sala-sin-permisos"
              className="bg-surface border border-border rounded-card p-8 text-center space-y-3 shadow-subtle"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <ShieldAlert className="w-6 h-6" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-ink">Sin permisos en Control de Sala</h2>
              <p className="text-sm text-muted max-w-md mx-auto">
                Tu cuenta actual no tiene permisos asignados para consultar vistas operativas del
                módulo de Sala. Solicita acceso a un administrador si lo necesitas.
              </p>
            </section>
          ) : (
            <>
              <nav
                role="tablist"
                aria-label="Vistas de sala"
                className="flex gap-6 border-b border-border mb-6 overflow-x-auto"
              >
                {visibleTabs.map((item, index) => (
                  <button
                    key={item.key}
                    ref={(element) => {
                      tabRefs.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`${id}-tab-${item.key}`}
                    aria-controls={`${id}-panel-${item.key}`}
                    aria-selected={activeView === item.key}
                    tabIndex={activeView === item.key ? 0 : -1}
                    onClick={() => setView(item.key)}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                        return;
                      }
                      event.preventDefault();
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? visibleTabs.length - 1
                            : (index + (event.key === 'ArrowRight' ? 1 : -1) + visibleTabs.length) %
                              visibleTabs.length;
                      setView(visibleTabs[next].key);
                      tabRefs.current[next]?.focus();
                    }}
                    className={`h-12 border-b-2 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary ${activeView === item.key ? 'text-primary border-primary' : 'text-muted border-transparent hover:text-ink'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <div
                role="tabpanel"
                id={`${id}-panel-${activeView}`}
                aria-labelledby={`${id}-tab-${activeView}`}
              >
                {activeView === 'plano' && <PlanoSalaView />}
                {activeView === 'reservas' && <ReservasView />}
                {activeView === 'espera' && <ListaEsperaView />}
                {activeView === 'mesas' && <AdministracionMesasView />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function App({ token, currentUser, theme }: FederatedModuleProps = {}) {
  const existingQueryClient = useContext(QueryClientContext);
  const existingSocket = useContext(SalaSocketContext);
  const [storedSession, setStoredSession] = useState<StoredShellSession | null>(() =>
    getStoredSession(),
  );

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SESSION_STORAGE_KEY || event.key === null) {
        setStoredSession(getStoredSession());
      }
    };
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, []);

  const activeToken = useMemo(() => {
    if (token !== undefined) {
      return typeof token === 'string' && token.trim() ? token.trim() : null;
    }
    return storedSession?.accessToken || getDevEnvToken();
  }, [token, storedSession]);

  const activeUser = useMemo(() => {
    if (currentUser !== undefined) {
      return currentUser;
    }
    if (storedSession?.user) {
      return storedSession.user;
    }
    if (activeToken) {
      return decodeJwtUser(activeToken);
    }
    return null;
  }, [currentUser, storedSession, activeToken]);

  const enforcePermissions = useMemo(() => {
    return (
      currentUser !== undefined ||
      storedSession !== null ||
      Boolean(activeToken) ||
      (import.meta.env.MODE !== 'test' && import.meta.env.VITE_USE_MOCKS !== 'true')
    );
  }, [currentUser, storedSession, activeToken]);

  const socketToken = useMemo(() => {
    if (!activeToken) {
      return null;
    }
    return activeToken.startsWith('Bearer ') ? activeToken : `Bearer ${activeToken}`;
  }, [activeToken]);

  const isEmbedded =
    token !== undefined ||
    currentUser !== undefined ||
    theme !== undefined ||
    !existingSocket ||
    !existingQueryClient;

  const content = <SalaContent theme={theme} isEmbedded={isEmbedded} />;
  const withSocket = existingSocket ? (
    content
  ) : (
    <SalaSocketProvider authToken={socketToken}>{content}</SalaSocketProvider>
  );
  const withAuth = (
    <SalaAuthProvider user={activeUser} theme={theme} enforcePermissions={enforcePermissions}>
      {withSocket}
    </SalaAuthProvider>
  );
  const withQuery = existingQueryClient ? (
    withAuth
  ) : (
    <QueryClientProvider client={queryClient}>{withAuth}</QueryClientProvider>
  );

  return (
    <>
      <TokenSync token={token} />
      {withQuery}
    </>
  );
}

export default App;
