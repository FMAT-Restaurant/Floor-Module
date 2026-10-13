import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, LayoutGrid, RotateCcw, CheckCircle2, X } from 'lucide-react';
import {
  EstadoMesa,
  fixtureMeserosCatalogo,
  type MesaEnVivoDto,
  type MeseroCatalogoItem,
  type OcuparMesaResponseDto,
} from '@floor/shared';
import { getMesasEnVivo } from '../api/services/mesas.service';
import { queryKeys } from '../api/queryKeys';
import { MesaCard } from '../components/MesaCard';
import { OcuparMesaModal } from '../components/OcuparMesaModal';
import { AccionesMesa } from '../components/AccionesMesa';
import { cn } from '../lib/utils';

export interface PlanoSalaViewProps {
  readonly onSelectMesa?: (mesa: MesaEnVivoDto) => void;
  readonly onAccionMesa?: (mesa: MesaEnVivoDto) => void;
  readonly selectedMesaId?: string | null;
  readonly meserosCatalogo?: readonly MeseroCatalogoItem[];
}

interface MetricaItem {
  readonly key: string;
  readonly label: string;
  readonly valor: number;
  readonly badgeClass: string;
  readonly dotClass?: string;
}

export function PlanoSalaView({
  onSelectMesa,
  onAccionMesa,
  selectedMesaId,
  meserosCatalogo = fixtureMeserosCatalogo,
}: PlanoSalaViewProps): React.JSX.Element {
  const [selectedZona, setSelectedZona] = useState<string>('Todas');
  const [localSelectedMesaId, setLocalSelectedMesaId] = useState<string | null>(null);
  const [mesaParaOcupar, setMesaParaOcupar] = useState<MesaEnVivoDto | null>(null);
  const [toastExito, setToastExito] = useState<string | null>(null);

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

  const metricasConfig = useMemo<MetricaItem[]>(
    () => [
      {
        key: 'total',
        label: 'Total:',
        valor: metricas.total,
        badgeClass: 'bg-canvas border-border text-ink font-semibold',
      },
      {
        key: 'disponibles',
        label: 'Disponibles:',
        valor: metricas.libres,
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium',
        dotClass: 'bg-emerald-500',
      },
      {
        key: 'ocupadas',
        label: 'Ocupadas:',
        valor: metricas.ocupadas,
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-medium',
        dotClass: 'bg-amber-500',
      },
      {
        key: 'limpieza',
        label: 'Limpieza pendiente:',
        valor: metricas.limpieza,
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 font-medium',
        dotClass: 'bg-amber-400',
      },
      {
        key: 'reserva',
        label: 'Reserva próxima:',
        valor: metricas.conReserva,
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 font-medium',
        dotClass: 'bg-blue-500',
      },
    ],
    [metricas],
  );

  const zonas = useMemo(() => {
    const uniqueZonas = new Set<string>();
    for (const m of mesas) {
      if (m.zona) {
        uniqueZonas.add(m.zona);
      }
    }
    return ['Todas', ...Array.from(uniqueZonas)];
  }, [mesas]);

  const unionesMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const m of mesas) {
      if (m.unionId) {
        const list = map.get(m.unionId) ?? [];
        list.push(m.numeroMesa);
        map.set(m.unionId, list);
      }
    }
    return map;
  }, [mesas]);

  const mesasFiltradas = useMemo(() => {
    if (selectedZona === 'Todas') {
      return mesas;
    }
    return mesas.filter((m) => m.zona === selectedZona);
  }, [mesas, selectedZona]);

  React.useEffect(() => {
    if (!toastExito) return;
    const timer = setTimeout(() => {
      setToastExito(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toastExito]);

  const handleSelectMesa = (mesa: MesaEnVivoDto) => {
    setLocalSelectedMesaId(mesa.mesaId);
    if (mesa.estadoFisico === EstadoMesa.LIBRE) {
      setMesaParaOcupar(mesa);
    }
    onSelectMesa?.(mesa);
  };

  const handleAccionMesa = (mesa: MesaEnVivoDto) => {
    if (mesa.estadoFisico === EstadoMesa.LIBRE) {
      setMesaParaOcupar(mesa);
    }
    onAccionMesa?.(mesa);
  };

  const handleOcupacionSuccess = (_response: OcuparMesaResponseDto) => {
    const numero = mesaParaOcupar?.numeroMesa ?? '';
    setToastExito(`Mesa ${numero} ocupada exitosamente.`);
    setMesaParaOcupar(null);
  };

  return (
    <div className="space-y-6">
      {/* Barra superior con métricas rápidas de conteo por estado */}
      <section
        aria-label="Resumen de mesas"
        className="bg-surface border border-border rounded-card p-4 shadow-subtle flex flex-wrap items-center gap-2"
      >
        {metricasConfig.map((item) => (
          <div
            key={item.key}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-control border',
              item.badgeClass,
            )}
          >
            {item.dotClass && (
              <span className={cn('w-2 h-2 rounded-full', item.dotClass)} aria-hidden="true" />
            )}
            <span>{item.label}</span>
            <span className="font-bold">{item.valor}</span>
          </div>
        ))}
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
          {mesasFiltradas.map((mesa) => {
            const mesasUnidas = mesa.unionId ? unionesMap.get(mesa.unionId) : undefined;

            return (
              <MesaCard
                key={mesa.mesaId}
                mesa={mesa}
                isSelected={currentSelectedMesaId === mesa.mesaId}
                onSelect={handleSelectMesa}
                onAccion={handleAccionMesa}
                mesasUnidas={mesasUnidas}
                meseroNombre={meserosCatalogo.find((m) => m.meseroId === mesa.meseroId)?.nombre}
                acciones={<AccionesMesa mesa={mesa} meserosCatalogo={meserosCatalogo} />}
              />
            );
          })}
        </div>
      )}

      {/* Modal de Ocupación de Mesa */}
      <OcuparMesaModal
        mesa={mesaParaOcupar}
        isOpen={Boolean(mesaParaOcupar)}
        onClose={() => setMesaParaOcupar(null)}
        onSuccess={handleOcupacionSuccess}
        meserosCatalogo={meserosCatalogo}
      />

      {/* Toast informativo de éxito */}
      {toastExito && (
        <div
          role="status"
          data-testid="toast-ocupacion-exitosa"
          className="fixed bottom-6 right-6 z-50 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-card shadow-lg flex items-center gap-3 animate-fadeIn"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">{toastExito}</span>
          <button
            type="button"
            aria-label="Cerrar notificación"
            onClick={() => setToastExito(null)}
            className="text-emerald-700 hover:text-emerald-900 ml-2 focus:outline-none"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
