import { useSalaSocket } from './hooks';
import { PlanoSalaView } from './views';

export function App() {
  const { isConnected } = useSalaSocket();

  return (
    <div className="min-h-screen bg-canvas text-text">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="bg-surface border border-border rounded-card p-6 shadow-subtle flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">Floor Module</h1>
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
          <PlanoSalaView />
        </main>
      </div>
    </div>
  );
}

export default App;
