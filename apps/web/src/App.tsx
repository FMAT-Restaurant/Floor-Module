import { EstadoMesa } from '@floor/shared';

export function App() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-6 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Floor Module</h1>
            <span className="text-xs bg-indigo-50 text-indigo-600 font-semibold px-2 py-0.5 rounded-full border border-indigo-200">
              v1.0.0
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Gestión de Sala, Mesas y Reservas en tiempo real</p>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            {EstadoMesa.LIBRE}: 0
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {EstadoMesa.OCUPADA}: 0
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            {EstadoMesa.LIMPIEZA_PENDIENTE}: 0
          </span>
        </div>
      </header>

      <main className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
        <p className="text-slate-600">
          Andamiaje inicial del Monorepo configurado con éxito. Listo para integrar el estándar de diseño.
        </p>
      </main>
    </div>
  );
}

export default App;
