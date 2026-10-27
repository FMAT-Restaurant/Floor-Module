import { useId, useRef, useState } from 'react';
import { useSalaSocket } from './hooks';
import { AdministracionMesasView, ListaEsperaView, PlanoSalaView, ReservasView } from './views';

const views = [
  { key: 'plano', label: 'Plano de sala' },
  { key: 'reservas', label: 'Reservas' },
  { key: 'mesas', label: 'Configuración de mesas' },
  { key: 'espera', label: 'Lista de espera' },
] as const;

type ViewKey = (typeof views)[number]['key'];

export function App() {
  const { isConnected } = useSalaSocket();
  const id = useId();
  const [view, setView] = useState<ViewKey>('plano');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <div className="min-h-screen bg-canvas text-text">
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
          <nav
            role="tablist"
            aria-label="Vistas de sala"
            className="flex gap-6 border-b border-border mb-6"
          >
            {views.map((item, index) => (
              <button
                key={item.key}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${item.key}`}
                aria-controls={`${id}-panel-${item.key}`}
                aria-selected={view === item.key}
                tabIndex={view === item.key ? 0 : -1}
                onClick={() => setView(item.key)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? views.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + views.length) %
                          views.length;
                  setView(views[next].key);
                  tabRefs.current[next]?.focus();
                }}
                className={`h-12 border-b-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary ${view === item.key ? 'text-primary border-primary' : 'text-muted border-transparent hover:text-ink'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div role="tabpanel" id={`${id}-panel-${view}`} aria-labelledby={`${id}-tab-${view}`}>
            {view === 'plano' ? (
              <PlanoSalaView />
            ) : view === 'reservas' ? (
              <ReservasView />
            ) : view === 'espera' ? (
              <ListaEsperaView />
            ) : (
              <AdministracionMesasView />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
