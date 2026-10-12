import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
      {/* Barra de métricas rápidas con conteo por estado */}
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
          <span>Limpieza:</span>
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

      {/* Cuadrícula responsiva de mesas */}
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
    </div>
  );
}
