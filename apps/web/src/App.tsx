import { EstadoMesa } from '@floor/shared';
import { useSalaSocket } from './hooks';

export function App() {
  const { isConnected } = useSalaSocket();

  return (
    <div className="min-h-screen bg-canvas text-text">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
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
                  En vivo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Reconectando
                </span>
              )}
            </div>
            <p className="text-sm text-muted mt-1">
              Gestión de Sala, Mesas y Reservas en tiempo real
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-control border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {EstadoMesa.LIBRE}: 0
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-control border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {EstadoMesa.OCUPADA}: 0
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-control border border-blue-200">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {EstadoMesa.LIMPIEZA_PENDIENTE}: 0
            </span>
          </div>
        </header>

        <main className="space-y-6">
          <section className="bg-surface border border-border rounded-card p-6 shadow-subtle">
            <h2 className="text-lg font-bold text-ink mb-2">Cimientos y Tokens de Diseño v2.0</h2>
            <p className="text-sm text-text">
              Monorepo configurado con tokens de diseño oficiales, TanStack Query y cliente API
              centralizado para la gestión operativa de Sala y Reservas.
            </p>
          </section>

          <section className="bg-surface border border-border rounded-card p-6 shadow-subtle space-y-4">
            <h3 className="text-base font-semibold text-ink">
              Componentes Canónicos de Referencia
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="h-control px-4 bg-primary hover:bg-primary-hover text-surface text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-2"
              >
                Acción Principal
              </button>
              <button
                type="button"
                className="h-control px-4 bg-surface border border-border hover:bg-canvas text-text text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-2"
              >
                Vista Previa
              </button>
              <button
                type="button"
                className="h-control px-4 bg-red-600 hover:bg-red-700 text-surface text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-2"
              >
                Descartar
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
