import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, LayoutGrid, RotateCcw } from 'lucide-react';
import { EstadoMesa, type MesaEnVivoDto } from '@floor/shared';
import { getMesasEnVivo } from '../api/services/mesas.service';
import { queryKeys } from '../api/queryKeys';
import { MesaCard } from '../components/MesaCard';
import { cn } from '../lib/utils';

export interface PlanoSalaViewProps {
  onSelectMesa?: (mesa: MesaEnVivoDto) => void;
  onAccionMesa?: (mesa: MesaEnVivoDto) => void;
  selectedMesaId?: string | null;
}

export function PlanoSalaView({
  onSelectMesa,
  onAccionMesa,
  selectedMesaId,
}: PlanoSalaViewProps): React.JSX.Element {
  const [selectedZona, setSelectedZona] = useState<string>('Todas');
  const [localSelectedMesaId, setLocalSelectedMesaId] = useState<string | null>(null);

  const currentSelectedMesaId = selectedMesaId !== undefined ? selectedMesaId : localSelectedMesaId;

  const {
    data: mesas = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.mesas.enVivo(),
    queryFn: () => getMesasEnVivo(),
  });

  const metricas = useMemo(() => {
    const total = mesas.length;
    const libres = mesas.filter(
      (m) => m.estadoFisico === EstadoMesa.LIBRE && !m.tieneReservaProxima,
    ).length;
    const ocupadas = mesas.filter((m) => m.estadoFisico === EstadoMesa.OCUPADA).length;
    const limpieza = mesas.filter((m) => m.estadoFisico === EstadoMesa.LIMPIEZA_PENDIENTE).length;
    const conReserva = mesas.filter((m) => m.tieneReservaProxima).length;

    return { total, libres, ocupadas, limpieza, conReserva };
  }, [mesas]);

  const zonas = useMemo(() => {
    const uniqueZonas = new Set<string>();
    for (const m of mesas) {
      if (m.zona) {
        uniqueZonas.add(m.zona);
      }
    }
    return ['Todas', ...Array.from(uniqueZonas)];
  }, [mesas]);

  const mesasFiltradas = useMemo(() => {
    if (selectedZona === 'Todas') {
      return mesas;
    }
    return mesas.filter((m) => m.zona === selectedZona);
  }, [mesas, selectedZona]);

  const handleSelectMesa = (mesa: MesaEnVivoDto) => {
    setLocalSelectedMesaId(mesa.mesaId);
    onSelectMesa?.(mesa);
  };

  return (
    <div className="space-y-6">
      {/* Barra superior con métricas rápidas de conteo por estado */}
      <section
        aria-label="Resumen de mesas"
        className="bg-surface border border-border rounded-card p-4 shadow-subtle flex flex-wrap items-center gap-2"
      >
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-control bg-canvas border border-border text-ink">
          <span>Total:</span>
          <span className="font-bold">{metricas.total}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-control bg-emerald-50 text-emerald-800 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span>Disponibles:</span>
          <span className="font-bold">{metricas.libres}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-control bg-amber-50 text-amber-800 border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
          <span>Ocupadas:</span>
          <span className="font-bold">{metricas.ocupadas}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-control bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
          <span>Limpieza pendiente:</span>
          <span className="font-bold">{metricas.limpieza}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-control bg-blue-50 text-blue-800 border border-blue-200">
          <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
          <span>Reserva próxima:</span>
          <span className="font-bold">{metricas.conReserva}</span>
        </div>
      </section>

      {/* Pestañas de zona */}
      <nav
        role="tablist"
        aria-label="Filtrar mesas por zona"
        className="border-b border-border flex items-center gap-6 overflow-x-auto"
      >
        {zonas.map((zona) => {
          const isActive = selectedZona === zona;
          return (
            <button
              key={zona}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedZona(zona)}
              className={cn(
                'pb-3 pt-1 text-sm transition-colors whitespace-nowrap border-b-2 font-medium',
                isActive
                  ? 'text-primary border-primary font-semibold'
                  : 'text-muted hover:text-ink border-transparent',
              )}
            >
              {zona}
            </button>
          );
        })}
      </nav>

      {/* Estado Asíncrono: Carga con skeletons animados */}
      {isLoading && (
        <div
          data-testid="mesas-loading-skeletons"
          aria-busy="true"
          aria-label="Cargando plano de sala"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              data-testid="mesa-skeleton"
              className="animate-pulse bg-gray-200 rounded-card h-44 p-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-5 w-20 bg-gray-300 rounded-full" />
                  <div className="h-4 w-12 bg-gray-300 rounded" />
                </div>
                <div className="h-6 w-24 bg-gray-300 rounded" />
                <div className="h-4 w-32 bg-gray-300 rounded" />
              </div>
              <div className="h-10 bg-gray-300 rounded-control w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Estado Asíncrono: Error con botón de reintento */}
      {isError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-card text-center space-y-3"
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-1">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-red-900">Error al cargar las mesas del plano</h3>
          <p className="text-sm text-red-700 max-w-md mx-auto">
            {error instanceof Error
              ? error.message
              : 'No se pudo obtener el estado en vivo de las mesas.'}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="h-control px-4 bg-primary hover:bg-primary-hover text-surface text-sm font-medium rounded-control transition-colors inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Estado Asíncrono: Vacío */}
      {!isLoading && !isError && mesasFiltradas.length === 0 && (
        <div className="bg-surface border border-border rounded-card p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-subtle">
          <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-muted">
            <LayoutGrid className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-ink">No hay mesas registradas en esta zona</h3>
          <p className="text-sm text-muted max-w-md">
            {selectedZona === 'Todas'
              ? 'Actualmente no hay ninguna mesa configurada en el sistema.'
              : `No se encontraron mesas registradas en la zona "${selectedZona}".`}
          </p>
        </div>
      )}

      {/* Cuadrícula de mesas poblada */}
      {!isLoading && !isError && mesasFiltradas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {mesasFiltradas.map((mesa) => (
            <MesaCard
              key={mesa.mesaId}
              mesa={mesa}
              isSelected={currentSelectedMesaId === mesa.mesaId}
              onSelect={handleSelectMesa}
              onAccion={onAccionMesa}
            />
          ))}
        </div>
      )}
    </div>
  );
}
