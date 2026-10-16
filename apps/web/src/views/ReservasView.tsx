import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  BellRing,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Phone,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  EstadoReserva,
  consultarDisponibilidadQuerySchema,
  type ConsultarDisponibilidadQueryDto,
  type MesaDto,
  type ReservaDto,
  type ReservaProximaAlertaPayload,
} from '@floor/shared';
import { DatePicker } from '../components/DatePicker';
import { getMesas } from '../api/services/mesas.service';
import { getReservas, verificarDisponibilidad } from '../api/services/reservas.service';
import { queryKeys } from '../api/queryKeys';
import { useSalaSocket } from '../hooks/useSalaSocket';
import { getFechaLocalHoy } from '../lib/reservas';
import { cn } from '../lib/utils';

export interface ReservasViewProps {
  readonly initialFecha?: string;
  readonly onSeleccionarMesaDisponible?: (
    mesa: MesaDto,
    criterios: ConsultarDisponibilidadQueryDto,
  ) => void;
}

type FiltroEstado = 'Todas' | EstadoReserva;
type FranjaHoraria = 'Todas' | 'manana' | 'tarde' | 'noche';

const PESTAÑAS_ESTADO: readonly { key: FiltroEstado; label: string }[] = [
  { key: 'Todas', label: 'Todas' },
  { key: EstadoReserva.CONFIRMADA, label: EstadoReserva.CONFIRMADA },
  { key: EstadoReserva.COMPLETADA, label: EstadoReserva.COMPLETADA },
  { key: EstadoReserva.CANCELADA, label: EstadoReserva.CANCELADA },
  { key: EstadoReserva.NO_SHOW, label: EstadoReserva.NO_SHOW },
];

const DURACIONES_RAPIDAS = [60, 90, 120] as const;

const ESTADO_BADGE_CONFIG: Record<
  EstadoReserva,
  { readonly badgeClass: string; readonly dotClass: string }
> = {
  [EstadoReserva.CONFIRMADA]: {
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  [EstadoReserva.COMPLETADA]: {
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  [EstadoReserva.CANCELADA]: {
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-400',
  },
  [EstadoReserva.NO_SHOW]: {
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
    dotClass: 'bg-red-500',
  },
};

function getHoraEnMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function coincideFranjaHoraria(horaInicio: string, franja: FranjaHoraria): boolean {
  if (franja === 'Todas') return true;
  const minutos = getHoraEnMinutos(horaInicio);
  if (franja === 'manana') return minutos < 13 * 60;
  if (franja === 'tarde') return minutos >= 13 * 60 && minutos < 19 * 60;
  return minutos >= 19 * 60;
}

export function EstadoReservaBadge({
  estado,
}: {
  readonly estado: EstadoReserva;
}): React.JSX.Element {
  const config = ESTADO_BADGE_CONFIG[estado];
  return (
    <span
      data-testid={`badge-estado-${estado}`}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border',
        config.badgeClass,
      )}
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', config.dotClass)} aria-hidden="true" />
      <span>{estado}</span>
    </span>
  );
}

export function ReservasView({
  initialFecha,
  onSeleccionarMesaDisponible,
}: ReservasViewProps): React.JSX.Element {
  const id = useId();
  const [selectedFecha, setSelectedFecha] = useState<string>(
    () => initialFecha ?? getFechaLocalHoy(),
  );
  const [selectedEstado, setSelectedEstado] = useState<FiltroEstado>('Todas');
  const [selectedMesaId, setSelectedMesaId] = useState<string>('Todas');
  const [selectedFranja, setSelectedFranja] = useState<FranjaHoraria>('Todas');
  const [alertaProxima, setAlertaProxima] = useState<ReservaProximaAlertaPayload | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Estados del Buscador Interactivo de Disponibilidad (RF-015)
  const [dispFecha, setDispFecha] = useState<string>(() => initialFecha ?? getFechaLocalHoy());
  const [dispHoraInicio, setDispHoraInicio] = useState<string>('19:00');
  const [dispDuracion, setDispDuracion] = useState<string>('90');
  const [dispPersonas, setDispPersonas] = useState<string>('2');
  const [dispErrores, setDispErrores] = useState<Record<string, string>>({});
  const [criteriosDisponibilidad, setCriteriosDisponibilidad] =
    useState<ConsultarDisponibilidadQueryDto | null>(null);

  const handleCambiarFechaAgenda = (nuevaFecha: string) => {
    setSelectedFecha(nuevaFecha);
    setDispFecha(nuevaFecha);
  };

  const handleReservaProximaAlerta = useCallback((payload: ReservaProximaAlertaPayload) => {
    setAlertaProxima(payload);
  }, []);

  useSalaSocket({
    onReservaProximaAlerta: handleReservaProximaAlerta,
  });

  const reservasQuery = useQuery({
    queryKey: queryKeys.reservas.list({ fecha: selectedFecha }),
    queryFn: () => getReservas({ fecha: selectedFecha }),
  });

  const mesasQuery = useQuery({
    queryKey: queryKeys.mesas.list(),
    queryFn: () => getMesas(),
  });

  const disponibilidadQuery = useQuery({
    queryKey: queryKeys.reservas.disponibilidad(
      criteriosDisponibilidad
        ? (criteriosDisponibilidad as unknown as Record<string, unknown>)
        : undefined,
    ),
    queryFn: () => verificarDisponibilidad(criteriosDisponibilidad!),
    enabled: criteriosDisponibilidad !== null,
  });

  const reservas = useMemo(() => reservasQuery.data ?? [], [reservasQuery.data]);
  const mesas = useMemo(() => mesasQuery.data ?? [], [mesasQuery.data]);
  const mesasDisponibles = useMemo(
    () => disponibilidadQuery.data ?? [],
    [disponibilidadQuery.data],
  );

  const mesasMap = useMemo(() => {
    const map = new Map<string, MesaDto>();
    for (const mesa of mesas) {
      map.set(mesa.mesaId, mesa);
    }
    return map;
  }, [mesas]);

  const contadores = useMemo(() => {
    let confirmada = 0;
    let completada = 0;
    let cancelada = 0;
    let noShow = 0;

    for (const r of reservas) {
      if (r.estado === EstadoReserva.CONFIRMADA) confirmada += 1;
      else if (r.estado === EstadoReserva.COMPLETADA) completada += 1;
      else if (r.estado === EstadoReserva.CANCELADA) cancelada += 1;
      else if (r.estado === EstadoReserva.NO_SHOW) noShow += 1;
    }

    return {
      total: reservas.length,
      confirmada,
      completada,
      cancelada,
      noShow,
    };
  }, [reservas]);

  const metricasConfig = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total:',
        valor: contadores.total,
        badgeClass: 'bg-canvas border-border text-ink font-semibold',
        dotClass: undefined,
      },
      {
        key: 'confirmada',
        label: `${EstadoReserva.CONFIRMADA}:`,
        valor: contadores.confirmada,
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 font-medium',
        dotClass: 'bg-blue-500',
      },
      {
        key: 'completada',
        label: `${EstadoReserva.COMPLETADA}:`,
        valor: contadores.completada,
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium',
        dotClass: 'bg-emerald-500',
      },
      {
        key: 'cancelada',
        label: `${EstadoReserva.CANCELADA}:`,
        valor: contadores.cancelada,
        badgeClass: 'bg-gray-100 text-gray-700 border-gray-200 font-medium',
        dotClass: 'bg-gray-400',
      },
      {
        key: 'no-show',
        label: `${EstadoReserva.NO_SHOW}:`,
        valor: contadores.noShow,
        badgeClass: 'bg-red-50 text-red-800 border-red-200 font-medium',
        dotClass: 'bg-red-500',
      },
    ],
    [contadores],
  );

  const reservasFiltradas = useMemo(() => {
    return reservas
      .filter((r: ReservaDto) => {
        if (selectedEstado !== 'Todas' && r.estado !== selectedEstado) return false;
        if (selectedMesaId !== 'Todas' && r.mesaId !== selectedMesaId) return false;
        if (!coincideFranjaHoraria(r.horaInicio, selectedFranja)) return false;
        return true;
      })
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }, [reservas, selectedEstado, selectedMesaId, selectedFranja]);

  const formatMesaLabel = (mesaId: string): string => {
    const mesa = mesasMap.get(mesaId);
    if (!mesa) return `Mesa ${mesaId.slice(0, 6)}`;
    return `Mesa ${mesa.numeroMesa} · ${mesa.zona}`;
  };

  const alertaMesaLabel = useMemo(() => {
    if (!alertaProxima) return '';
    const mesa = mesasMap.get(String(alertaProxima.mesaId));
    return mesa ? `Mesa ${mesa.numeroMesa} (${mesa.zona})` : `Mesa ${alertaProxima.mesaId}`;
  }, [alertaProxima, mesasMap]);

  const handleBuscarDisponibilidad = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = consultarDisponibilidadQuerySchema.safeParse({
      fecha: dispFecha,
      horaInicio: dispHoraInicio,
      duracion: dispDuracion,
      personas: dispPersonas,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        if (!nextErrors[field]) {
          nextErrors[field] = issue.message;
        }
      }
      setDispErrores(nextErrors);
      return;
    }

    setDispErrores({});
    const nextCriterios = parsed.data;
    if (
      criteriosDisponibilidad &&
      criteriosDisponibilidad.fecha === nextCriterios.fecha &&
      criteriosDisponibilidad.horaInicio === nextCriterios.horaInicio &&
      criteriosDisponibilidad.duracion === nextCriterios.duracion &&
      criteriosDisponibilidad.personas === nextCriterios.personas
    ) {
      void disponibilidadQuery.refetch();
    } else {
      setCriteriosDisponibilidad(nextCriterios);
    }
  };

  return (
    <section className="space-y-6" aria-labelledby={`${id}-title`}>
      {/* Encabezado y selector de fecha */}
      <div className="bg-surface border border-border rounded-card p-4 sm:p-6 shadow-subtle flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 id={`${id}-title`} className="text-xl font-bold text-ink">
            Agenda de reservas
          </h2>
          <p className="text-sm text-muted mt-1">
            Consulta los bloques horarios del día y verifica la disponibilidad de mesas en el salón.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <DatePicker
            id={`${id}-fecha-agenda`}
            label="Fecha de agenda"
            value={selectedFecha}
            onChange={(nuevaFecha) => handleCambiarFechaAgenda(nuevaFecha)}
          />
          <button
            type="button"
            onClick={() => handleCambiarFechaAgenda(getFechaLocalHoy())}
            className="h-control px-4 bg-surface border border-border hover:bg-canvas text-text text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CalendarIcon className="w-4 h-4 text-primary" aria-hidden="true" />
            <span>Hoy</span>
          </button>
        </div>
      </div>

      {/* Banner de alerta reactiva por evento WebSocket reserva.proxima_alerta (RF-016) */}
      {alertaProxima && (
        <div
          role="status"
          data-testid="alerta-reserva-proxima-ws"
          className="bg-amber-50 border border-amber-200 text-amber-900 rounded-card p-4 flex items-start justify-between gap-3 shadow-subtle"
        >
          <div className="flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <BellRing className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                <span>Alerta de reserva próxima</span>
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Reserva de <span className="font-semibold">{alertaProxima.nombreContacto}</span> en{' '}
                <span className="font-semibold">{alertaMesaLabel}</span> a las{' '}
                <span className="font-semibold">{alertaProxima.horaInicio}</span> (en{' '}
                {alertaProxima.minutosRestantes} min).
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar alerta de reserva próxima"
            onClick={() => setAlertaProxima(null)}
            className="h-8 w-8 rounded-control inline-flex items-center justify-center text-amber-700 hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Contadores rápidos por estado */}
      <section
        aria-label="Resumen de reservas del día"
        className="bg-surface border border-border rounded-card p-4 shadow-subtle flex flex-wrap items-center gap-2"
      >
        {metricasConfig.map((item) => (
          <div
            key={item.key}
            data-testid={`contador-reserva-${item.key}`}
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

      {/* Buscador Interactivo de Disponibilidad (RF-015) */}
      <section
        aria-label="Buscador de disponibilidad de mesas"
        data-testid="buscador-disponibilidad"
        className="bg-surface border border-border rounded-card p-4 sm:p-6 shadow-subtle space-y-4"
      >
        <div>
          <h3 className="text-lg font-bold text-ink">Consultar disponibilidad de mesas</h3>
          <p className="text-sm text-muted mt-0.5">
            Encuentra mesas activas con capacidad suficiente y sin conflictos en la franja horaria
            solicitada.
          </p>
        </div>

        <form onSubmit={handleBuscarDisponibilidad} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Fecha */}
            <DatePicker
              id={`${id}-disp-fecha`}
              name="fecha"
              label="Fecha de reserva"
              required
              value={dispFecha}
              error={dispErrores.fecha}
              onChange={(nueva) => setDispFecha(nueva)}
            />

            {/* Hora de inicio */}
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-disp-hora`} className="text-sm font-medium text-ink">
                Hora de inicio <span className="text-red-500">*</span>
              </label>
              <input
                id={`${id}-disp-hora`}
                name="horaInicio"
                type="time"
                value={dispHoraInicio}
                aria-invalid={Boolean(dispErrores.horaInicio)}
                onChange={(e) => setDispHoraInicio(e.target.value)}
                className={cn(
                  'h-control px-3 bg-surface border border-border rounded-control text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
                  dispErrores.horaInicio &&
                    'border-red-500 focus:border-red-500 focus:ring-red-500',
                )}
              />
              {dispErrores.horaInicio && (
                <span role="alert" className="text-xs text-red-600">
                  {dispErrores.horaInicio}
                </span>
              )}
            </div>

            {/* Duración */}
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-disp-duracion`} className="text-sm font-medium text-ink">
                Duración (minutos) <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`${id}-disp-duracion`}
                  name="duracion"
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={dispDuracion}
                  aria-invalid={Boolean(dispErrores.duracion)}
                  onChange={(e) => setDispDuracion(e.target.value)}
                  className={cn(
                    'h-control px-3 w-full bg-surface border border-border rounded-control text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
                    dispErrores.duracion &&
                      'border-red-500 focus:border-red-500 focus:ring-red-500',
                  )}
                />
                <div className="flex items-center gap-1 shrink-0">
                  {DURACIONES_RAPIDAS.map((min) => {
                    const isSelected = Number(dispDuracion) === min;
                    return (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setDispDuracion(String(min))}
                        className={cn(
                          'h-control px-2.5 text-xs font-medium rounded-control border transition-colors',
                          isSelected
                            ? 'bg-primary-soft border-primary text-primary font-semibold'
                            : 'bg-surface border-border text-muted hover:text-ink',
                        )}
                      >
                        {min}m
                      </button>
                    );
                  })}
                </div>
              </div>
              {dispErrores.duracion && (
                <span role="alert" className="text-xs text-red-600">
                  {dispErrores.duracion}
                </span>
              )}
            </div>

            {/* Personas */}
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-disp-personas`} className="text-sm font-medium text-ink">
                Cantidad de personas <span className="text-red-500">*</span>
              </label>
              <input
                id={`${id}-disp-personas`}
                name="personas"
                type="number"
                min={1}
                value={dispPersonas}
                aria-invalid={Boolean(dispErrores.personas)}
                onChange={(e) => setDispPersonas(e.target.value)}
                className={cn(
                  'h-control px-3 bg-surface border border-border rounded-control text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
                  dispErrores.personas && 'border-red-500 focus:border-red-500 focus:ring-red-500',
                )}
              />
              {dispErrores.personas && (
                <span role="alert" className="text-xs text-red-600">
                  {dispErrores.personas}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={disponibilidadQuery.isFetching}
              className="h-control px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <span>Buscar disponibilidad</span>
            </button>
          </div>
        </form>

        {/* Resultados del buscador de disponibilidad */}
        {disponibilidadQuery.isFetching && (
          <div
            data-testid="disponibilidad-loading-skeletons"
            aria-busy="true"
            aria-label="Consultando disponibilidad de mesas"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2"
          >
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="animate-pulse bg-gray-200 rounded-card h-28 p-4 flex flex-col justify-between"
              >
                <div className="h-4 w-28 bg-gray-300 rounded" />
                <div className="h-5 w-20 bg-gray-300 rounded" />
                <div className="h-3 w-32 bg-gray-300 rounded" />
              </div>
            ))}
          </div>
        )}

        {!disponibilidadQuery.isFetching && disponibilidadQuery.isError && (
          <div
            role="alert"
            data-testid="disponibilidad-error-banner"
            className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-card flex flex-col sm:flex-row items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
              <span>
                {disponibilidadQuery.error instanceof Error
                  ? disponibilidadQuery.error.message
                  : 'Error al consultar la disponibilidad de mesas.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                void disponibilidadQuery.refetch();
              }}
              className="h-control px-4 bg-surface border border-border hover:bg-canvas text-text text-sm font-medium rounded-control inline-flex items-center gap-1.5 shrink-0"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reintentar disponibilidad</span>
            </button>
          </div>
        )}

        {!disponibilidadQuery.isFetching &&
          !disponibilidadQuery.isError &&
          criteriosDisponibilidad !== null && (
            <div className="pt-2 space-y-3" data-testid="disponibilidad-resultados">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-ink">
                  Mesas disponibles para el {criteriosDisponibilidad.fecha} a las{' '}
                  {criteriosDisponibilidad.horaInicio} ({criteriosDisponibilidad.duracion} min ·{' '}
                  {criteriosDisponibilidad.personas} personas)
                </h4>
                <span className="text-xs font-medium text-muted">
                  {mesasDisponibles.length}{' '}
                  {mesasDisponibles.length === 1 ? 'mesa apta' : 'mesas aptas'}
                </span>
              </div>

              {mesasDisponibles.length === 0 ? (
                <div
                  data-testid="disponibilidad-empty-state"
                  className="bg-canvas border border-border rounded-card p-6 text-center space-y-1"
                >
                  <p className="text-sm font-semibold text-ink">
                    No hay mesas disponibles en ese horario
                  </p>
                  <p className="text-xs text-muted">
                    Ninguna mesa activa cumple con la capacidad solicitada o todas tienen reservas
                    confirmadas en esa franja horaria.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {mesasDisponibles.map((mesa) => (
                    <div
                      key={mesa.mesaId}
                      data-testid={`mesa-disponible-card-${mesa.numeroMesa}`}
                      className="bg-primary-soft border border-primary rounded-card p-4 flex flex-col justify-between gap-3 transition-all"
                    >
                      <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <span
                            className="w-2 h-2 rounded-full bg-emerald-500"
                            aria-hidden="true"
                          />
                          <span>Disponible para reservar</span>
                        </span>
                        <h5 className="text-base font-bold text-ink">Mesa {mesa.numeroMesa}</h5>
                        <p className="text-xs text-text font-medium">
                          {mesa.capacidad} personas · {mesa.zona}
                        </p>
                      </div>

                      {onSeleccionarMesaDisponible && (
                        <button
                          type="button"
                          onClick={() => onSeleccionarMesaDisponible(mesa, criteriosDisponibilidad)}
                          className="h-control w-full px-3 bg-primary hover:bg-primary-hover text-white text-xs font-medium rounded-control transition-colors inline-flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Seleccionar Mesa {mesa.numeroMesa}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
      </section>

      {/* Panel de Agenda Diaria */}
      <div className="bg-surface border border-border rounded-card p-4 sm:p-6 shadow-subtle space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-border pb-4">
          {/* Pestañas por estado */}
          <nav
            role="tablist"
            aria-label="Filtrar reservas por estado"
            className="flex items-center gap-4 sm:gap-6 overflow-x-auto"
          >
            {PESTAÑAS_ESTADO.map((tab, index) => {
              const isActive = selectedEstado === tab.key;
              return (
                <button
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setSelectedEstado(tab.key)}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? PESTAÑAS_ESTADO.length - 1
                          : (index +
                              (event.key === 'ArrowRight' ? 1 : -1) +
                              PESTAÑAS_ESTADO.length) %
                            PESTAÑAS_ESTADO.length;
                    setSelectedEstado(PESTAÑAS_ESTADO[next].key);
                    tabRefs.current[next]?.focus();
                  }}
                  className={cn(
                    'pb-3 pt-1 text-sm transition-colors whitespace-nowrap border-b-2 font-medium focus-visible:ring-2 focus-visible:ring-primary',
                    isActive
                      ? 'text-primary border-primary font-semibold'
                      : 'text-muted hover:text-ink border-transparent',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Filtros adicionales por mesa y franja horaria */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-filtro-mesa`} className="text-xs font-medium text-text">
                Filtrar por mesa
              </label>
              <select
                id={`${id}-filtro-mesa`}
                value={selectedMesaId}
                onChange={(e) => setSelectedMesaId(e.target.value)}
                className="h-control px-3 bg-surface border border-border rounded-control text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="Todas">Todas las mesas</option>
                {mesas.map((m) => (
                  <option key={m.mesaId} value={m.mesaId}>
                    Mesa {m.numeroMesa} · {m.zona}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-filtro-franja`} className="text-xs font-medium text-text">
                Franja horaria
              </label>
              <select
                id={`${id}-filtro-franja`}
                value={selectedFranja}
                onChange={(e) => setSelectedFranja(e.target.value as FranjaHoraria)}
                className="h-control px-3 bg-surface border border-border rounded-control text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="Todas">Todo el día</option>
                <option value="manana">Mañana (&lt; 13:00)</option>
                <option value="tarde">Tarde (13:00 – 18:59)</option>
                <option value="noche">Noche (≥ 19:00)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Estado de Carga: Skeletons animados */}
        {reservasQuery.isLoading && (
          <div
            data-testid="reservas-loading-skeletons"
            aria-busy="true"
            aria-label="Cargando agenda de reservas"
            className="space-y-3"
          >
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                data-testid="reserva-skeleton"
                className="animate-pulse bg-gray-200 rounded-card h-20 p-4 flex items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 bg-gray-300 rounded" />
                  <div className="h-3 w-48 bg-gray-300 rounded" />
                </div>
                <div className="h-6 w-24 bg-gray-300 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* Estado de Error */}
        {reservasQuery.isError && (
          <div
            role="alert"
            data-testid="reservas-error-banner"
            className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-card text-center space-y-3"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-1">
              <AlertCircle className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-red-900">
              Error al cargar la agenda de reservas
            </h3>
            <p className="text-sm text-red-700 max-w-md mx-auto">
              {reservasQuery.error instanceof Error
                ? reservasQuery.error.message
                : 'No se pudieron obtener las reservas para la fecha seleccionada.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  void reservasQuery.refetch();
                }}
                className="h-control px-4 bg-primary hover:bg-primary-hover text-surface text-sm font-medium rounded-control transition-colors inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>Reintentar</span>
              </button>
            </div>
          </div>
        )}

        {/* Estado Vacío */}
        {!reservasQuery.isLoading && !reservasQuery.isError && reservasFiltradas.length === 0 && (
          <div
            data-testid="reservas-empty-state"
            className="bg-canvas border border-border rounded-card p-10 text-center flex flex-col items-center justify-center space-y-2"
          >
            <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-muted">
              <CalendarIcon className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-ink">
              No hay reservas para los criterios seleccionados
            </h3>
            <p className="text-sm text-muted max-w-md">
              {reservas.length === 0
                ? `No existen reservas registradas para la fecha ${selectedFecha}.`
                : 'Ninguna reserva del día coincide con los filtros de estado, mesa o horario aplicados.'}
            </p>
          </div>
        )}

        {/* Tabla / Bloques responsivos de reservas */}
        {!reservasQuery.isLoading && !reservasQuery.isError && reservasFiltradas.length > 0 && (
          <div className="border border-border rounded-card overflow-hidden">
            <table className="w-full text-sm" aria-label="Agenda de reservas">
              <thead className="hidden md:table-header-group bg-canvas text-xs font-semibold text-muted uppercase tracking-wider border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    Horario
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Mesa y zona
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Aforo
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border block md:table-row-group">
                {reservasFiltradas.map((reserva) => (
                  <tr
                    key={reserva.reservaId}
                    data-testid={`reserva-row-${reserva.reservaId}`}
                    className="flex flex-col md:table-row p-4 md:p-0 gap-2 md:gap-0 hover:bg-canvas/60 transition-colors"
                  >
                    <td className="block md:table-cell md:px-4 md:py-3.5 whitespace-nowrap">
                      <div className="flex items-center justify-between md:justify-start gap-2">
                        <span className="inline-flex items-center gap-1.5 font-bold text-ink tabular-nums">
                          <Clock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                          <span>
                            {reserva.horaInicio} – {reserva.horaFin}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="block md:table-cell md:px-4 md:py-3.5">
                      <div className="font-semibold text-ink">{reserva.nombreContacto}</div>
                      <div className="text-xs text-muted inline-flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{reserva.telefonoContacto}</span>
                      </div>
                    </td>
                    <td className="block md:table-cell md:px-4 md:py-3.5">
                      <span className="font-medium text-text">
                        {formatMesaLabel(reserva.mesaId)}
                      </span>
                    </td>
                    <td className="block md:table-cell md:px-4 md:py-3.5 md:text-right tabular-nums">
                      <span className="inline-flex items-center md:justify-end gap-1 text-text font-medium">
                        <Users className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                        <span>{reserva.cantidadPersonas} personas</span>
                      </span>
                    </td>
                    <td className="block md:table-cell md:px-4 md:py-3.5 md:text-right">
                      <EstadoReservaBadge estado={reserva.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
