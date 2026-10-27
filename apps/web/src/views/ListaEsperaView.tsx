import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  Plus,
  RotateCcw,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  EstadoEspera,
  crearEsperaSchema,
  type CrearEsperaRequestDto,
  type EsperaDto,
  type EsperaMesaDisponiblePayload,
  type MesaDto,
} from '@floor/shared';
import {
  cambiarEstadoEspera,
  getListaEspera,
  registrarEspera,
} from '../api/services/espera.service';
import { getMesas } from '../api/services/mesas.service';
import { queryKeys } from '../api/queryKeys';
import { isApiError } from '../api/error';
import { useSalaSocket } from '../hooks/useSalaSocket';
import { formatTiempoOcupada } from '../components/MesaCard/utils';
import { cn } from '../lib/utils';

export interface ListaEsperaViewProps {
  readonly now?: Date;
  readonly onAsignarMesaDisponible?: (payload: EsperaMesaDisponiblePayload) => void;
}

type FiltroEstadoEspera = 'Activos' | EstadoEspera;

const PESTAÑAS_ESTADO_ESPERA: readonly { key: FiltroEstadoEspera; label: string }[] = [
  { key: 'Activos', label: 'Activos' },
  { key: EstadoEspera.EN_ESPERA, label: EstadoEspera.EN_ESPERA },
  { key: EstadoEspera.NOTIFICADO, label: EstadoEspera.NOTIFICADO },
  { key: EstadoEspera.SENTADO, label: EstadoEspera.SENTADO },
  { key: EstadoEspera.CANCELADO, label: EstadoEspera.CANCELADO },
];

const AFOROS_RAPIDOS = [2, 4, 6] as const;

const ESTADO_ESPERA_BADGE_CONFIG: Record<
  EstadoEspera,
  { readonly badgeClass: string; readonly dotClass: string }
> = {
  [EstadoEspera.EN_ESPERA]: {
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  [EstadoEspera.NOTIFICADO]: {
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  [EstadoEspera.SENTADO]: {
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  [EstadoEspera.CANCELADO]: {
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-400',
  },
};

function formatHoraLlegada(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function EstadoEsperaBadge({
  estado,
}: {
  readonly estado: EstadoEspera;
}): React.JSX.Element {
  const config = ESTADO_ESPERA_BADGE_CONFIG[estado];
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

export function ListaEsperaView({
  now: propNow,
  onAsignarMesaDisponible,
}: ListaEsperaViewProps = {}): React.JSX.Element {
  const id = useId();
  const queryClient = useQueryClient();
  const [ahora, setAhora] = useState<Date>(() => propNow ?? new Date());
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (propNow) {
      setAhora(propNow);
      return;
    }
    const timer = window.setInterval(() => setAhora(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, [propNow]);

  // Filtro de estado de la cola
  const [selectedEstado, setSelectedEstado] = useState<FiltroEstadoEspera>('Activos');

  // Formulario rápido de registro presencial (RF-021)
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [cantidadPersonas, setCantidadPersonas] = useState('2');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formApiError, setFormApiError] = useState<string | null>(null);

  // Mensajes operativos y alertas en tiempo real (RF-020, RN-17)
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [alertaMesaDisponible, setAlertaMesaDisponible] =
    useState<EsperaMesaDisponiblePayload | null>(null);

  const handleEsperaMesaDisponible = useCallback(
    (payload: EsperaMesaDisponiblePayload) => {
      setAlertaMesaDisponible(payload);
      void queryClient.invalidateQueries({ queryKey: queryKeys.espera.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.enVivo() });
    },
    [queryClient],
  );

  useSalaSocket({
    onEsperaMesaDisponible: handleEsperaMesaDisponible,
  });

  // Escucha de simulación local en navegador (MSW / __FLOOR_MOCK__)
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<EsperaMesaDisponiblePayload>;
      if (custom.detail) {
        handleEsperaMesaDisponible(custom.detail);
      }
    };
    window.addEventListener('floor:espera.mesa_disponible', handler);
    return () => window.removeEventListener('floor:espera.mesa_disponible', handler);
  }, [handleEsperaMesaDisponible]);

  const estadoParam = selectedEstado === 'Activos' ? undefined : selectedEstado;

  const esperaQuery = useQuery({
    queryKey: queryKeys.espera.list(estadoParam),
    queryFn: () => getListaEspera(estadoParam ? { estado: estadoParam } : undefined),
  });

  // Consulta de activos para contadores rápidos superiores
  const activosQuery = useQuery({
    queryKey: queryKeys.espera.list(undefined),
    queryFn: () => getListaEspera(),
  });

  const mesasQuery = useQuery({
    queryKey: queryKeys.mesas.list(),
    queryFn: () => getMesas(),
  });

  const mesasMap = useMemo(() => {
    const map = new Map<string, MesaDto>();
    for (const mesa of mesasQuery.data ?? []) {
      map.set(mesa.mesaId, mesa);
    }
    return map;
  }, [mesasQuery.data]);

  // Orden FIFO garantizado por horaLlegada ASC (SPEC §5.6, RN-17)
  const colaOrdenada = useMemo(() => {
    const list = esperaQuery.data ?? [];
    return [...list].sort((a, b) => {
      const diff = new Date(a.horaLlegada).getTime() - new Date(b.horaLlegada).getTime();
      if (diff !== 0) return diff;
      return a.esperaId.localeCompare(b.esperaId);
    });
  }, [esperaQuery.data]);

  const contadores = useMemo(() => {
    const base = activosQuery.data ?? esperaQuery.data ?? [];
    let enEspera = 0;
    let notificado = 0;
    for (const item of base) {
      if (item.estado === EstadoEspera.EN_ESPERA) enEspera += 1;
      else if (item.estado === EstadoEspera.NOTIFICADO) notificado += 1;
    }
    return {
      activos: enEspera + notificado,
      enEspera,
      notificado,
    };
  }, [activosQuery.data, esperaQuery.data]);

  const formatMesaLabel = useCallback(
    (mesaId: string | null): string | null => {
      if (!mesaId) return null;
      const mesa = mesasMap.get(mesaId);
      if (!mesa) return `Mesa ${mesaId.slice(0, 6)}`;
      return `Mesa ${mesa.numeroMesa} · ${mesa.zona}`;
    },
    [mesasMap],
  );

  const alertaMesaLabel = useMemo(() => {
    if (!alertaMesaDisponible) return '';
    const mesa = mesasMap.get(alertaMesaDisponible.mesaId);
    return mesa
      ? `Mesa ${mesa.numeroMesa} (${mesa.zona})`
      : `Mesa ${alertaMesaDisponible.mesaId.slice(0, 6)}`;
  }, [alertaMesaDisponible, mesasMap]);

  const crearMutation = useMutation({
    mutationFn: (dto: CrearEsperaRequestDto) => registrarEspera(dto),
    onSuccess: (creada) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.espera.all });
      setNombreCliente('');
      setTelefonoContacto('');
      setCantidadPersonas('2');
      setFormErrors({});
      setFormApiError(null);
      setActionError(null);
      setNotice(`Cliente "${creada.nombreCliente}" agregado a la lista de espera.`);
    },
    onError: (err: unknown) => {
      if (isApiError(err)) {
        setFormApiError(err.message);
      } else if (err instanceof Error) {
        setFormApiError(err.message);
      } else {
        setFormApiError('No se pudo registrar al cliente en la lista de espera.');
      }
    },
  });

  const estadoMutation = useMutation({
    mutationFn: ({
      esperaId,
      estado,
    }: {
      esperaId: string;
      estado: EstadoEspera.SENTADO | EstadoEspera.CANCELADO | EstadoEspera.EN_ESPERA;
    }) => cambiarEstadoEspera(esperaId, { estado }),
    onSuccess: (actualizada) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.espera.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all });
      setActionError(null);
      if (alertaMesaDisponible?.esperaId === actualizada.esperaId) {
        setAlertaMesaDisponible(null);
      }
      const verbo =
        actualizada.estado === EstadoEspera.SENTADO
          ? 'marcado como Sentado'
          : actualizada.estado === EstadoEspera.CANCELADO
            ? 'cancelado de la lista de espera'
            : 'devuelto a En espera';
      setNotice(`Turno de "${actualizada.nombreCliente}" ${verbo}.`);
    },
    onError: (err: unknown) => {
      if (isApiError(err)) {
        setActionError(err.message);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('No se pudo actualizar el estado del turno en espera.');
      }
    },
  });

  const handleSubmitRegistro = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setFormApiError(null);

    const personasNum = Number(cantidadPersonas);
    const parsed = crearEsperaSchema.safeParse({
      nombreCliente,
      telefonoContacto,
      cantidadPersonas: Number.isNaN(personasNum) ? cantidadPersonas : personasNum,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        if (!nextErrors[field]) {
          nextErrors[field] = issue.message;
        }
      }
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});
    crearMutation.mutate(parsed.data);
  };

  const handleCambiarEstado = (
    item: EsperaDto,
    nuevoEstado: EstadoEspera.SENTADO | EstadoEspera.CANCELADO | EstadoEspera.EN_ESPERA,
  ) => {
    setNotice(null);
    setActionError(null);
    estadoMutation.mutate({ esperaId: item.esperaId, estado: nuevoEstado });
  };

  const handleAsignarDesdeAlerta = () => {
    if (!alertaMesaDisponible) return;
    setNotice(null);
    setActionError(null);
    onAsignarMesaDisponible?.(alertaMesaDisponible);
    estadoMutation.mutate({
      esperaId: alertaMesaDisponible.esperaId,
      estado: EstadoEspera.SENTADO,
    });
  };

  const pendingEsperaId = estadoMutation.isPending ? estadoMutation.variables?.esperaId : null;

  return (
    <section className="space-y-6" aria-labelledby={`${id}-title`}>
      {/* Banner de confirmación de acción exitosa */}
      {notice && (
        <div
          role="status"
          data-testid="espera-notice-banner"
          className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-card p-4 text-sm flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            aria-label="Cerrar mensaje de confirmación"
            onClick={() => setNotice(null)}
            className="h-8 w-8 rounded-control inline-flex items-center justify-center text-emerald-700 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Banner de error en mutación de estado */}
      {actionError && (
        <div
          role="alert"
          data-testid="espera-action-error-banner"
          className="bg-red-50 border border-red-200 text-red-800 rounded-card p-4 text-sm flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            aria-label="Cerrar mensaje de error"
            onClick={() => setActionError(null)}
            className="h-8 w-8 rounded-control inline-flex items-center justify-center text-red-700 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Alerta destacada en tiempo real por WebSocket: espera.mesa_disponible (RF-020, RN-17) */}
      {alertaMesaDisponible && (
        <div
          role="status"
          data-testid="alerta-mesa-disponible-ws"
          className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-subtle"
        >
          <div className="flex items-start gap-3">
            <span
              className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5 text-emerald-950">
                <BellRing className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>¡Mesa compatible disponible para lista de espera!</span>
              </p>
              <p className="text-xs text-emerald-800 mt-1">
                <span className="font-semibold">{alertaMesaDisponible.cliente.nombre}</span> (
                {alertaMesaDisponible.cliente.cantidadPersonas}{' '}
                {alertaMesaDisponible.cliente.cantidadPersonas === 1 ? 'persona' : 'personas'})
                tiene asignada la <span className="font-semibold">{alertaMesaLabel}</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="btn-asignar-mesa-alerta"
              disabled={estadoMutation.isPending}
              onClick={handleAsignarDesdeAlerta}
              className="h-control px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>Asignar mesa</span>
            </button>
            <button
              type="button"
              aria-label="Cerrar alerta de mesa disponible"
              onClick={() => setAlertaMesaDisponible(null)}
              className="h-control w-10 rounded-control inline-flex items-center justify-center text-emerald-800 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Contadores rápidos de la fila presencial */}
      <section
        aria-label="Resumen de lista de espera"
        className="bg-surface border border-border rounded-card p-4 shadow-subtle flex flex-wrap items-center gap-2"
      >
        <div
          data-testid="contador-espera-activos"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-control border bg-canvas border-border text-ink font-semibold"
        >
          <span>En cola activa:</span>
          <span className="font-bold">{contadores.activos}</span>
        </div>
        <div
          data-testid="contador-espera-en-espera"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-control border bg-amber-50 text-amber-800 border-amber-200 font-medium"
        >
          <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
          <span>En espera:</span>
          <span className="font-bold">{contadores.enEspera}</span>
        </div>
        <div
          data-testid="contador-espera-notificado"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-control border bg-blue-50 text-blue-800 border-blue-200 font-medium"
        >
          <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
          <span>Notificado:</span>
          <span className="font-bold">{contadores.notificado}</span>
        </div>
      </section>

      {/* Formulario rápido para registrar cliente en lista de espera (RF-021) */}
      <section
        aria-label="Registrar cliente en lista de espera"
        data-testid="formulario-registro-espera"
        className="bg-surface border border-border rounded-card p-4 sm:p-6 shadow-subtle space-y-4"
      >
        <div>
          <h3 className="text-lg font-bold text-ink">Agregar cliente a la fila presencial</h3>
          <p className="text-sm text-muted mt-0.5">
            Registra comensales sin reserva para asignarles mesa en orden de llegada (FIFO).
          </p>
        </div>

        {formApiError && (
          <div
            role="alert"
            data-testid="espera-form-api-error"
            className="bg-red-50 border border-red-200 text-red-800 rounded-control p-3 text-sm flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
            <span>{formApiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmitRegistro} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Nombre del cliente */}
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-nombre`} className="text-sm font-medium text-ink">
                Nombre del cliente <span className="text-red-500">*</span>
              </label>
              <input
                id={`${id}-nombre`}
                name="nombreCliente"
                type="text"
                value={nombreCliente}
                disabled={crearMutation.isPending}
                aria-invalid={Boolean(formErrors.nombreCliente)}
                onChange={(e) => setNombreCliente(e.target.value)}
                placeholder="Ej. Gabriel Torres"
                className={cn(
                  'h-control px-3 bg-surface border border-border rounded-control text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-gray-100 disabled:cursor-not-allowed',
                  formErrors.nombreCliente &&
                    'border-red-500 focus:border-red-500 focus:ring-red-500',
                )}
              />
              {formErrors.nombreCliente && (
                <span role="alert" className="text-xs text-red-600">
                  {formErrors.nombreCliente}
                </span>
              )}
            </div>

            {/* Teléfono de contacto */}
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-telefono`} className="text-sm font-medium text-ink">
                Teléfono de contacto <span className="text-red-500">*</span>
              </label>
              <input
                id={`${id}-telefono`}
                name="telefonoContacto"
                type="tel"
                value={telefonoContacto}
                disabled={crearMutation.isPending}
                aria-invalid={Boolean(formErrors.telefonoContacto)}
                onChange={(e) => setTelefonoContacto(e.target.value)}
                placeholder="Ej. +52 999 111 2233"
                className={cn(
                  'h-control px-3 bg-surface border border-border rounded-control text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-gray-100 disabled:cursor-not-allowed',
                  formErrors.telefonoContacto &&
                    'border-red-500 focus:border-red-500 focus:ring-red-500',
                )}
              />
              {formErrors.telefonoContacto && (
                <span role="alert" className="text-xs text-red-600">
                  {formErrors.telefonoContacto}
                </span>
              )}
            </div>

            {/* Cantidad de personas */}
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-personas`} className="text-sm font-medium text-ink">
                Cantidad de personas <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`${id}-personas`}
                  name="cantidadPersonas"
                  type="number"
                  min={1}
                  value={cantidadPersonas}
                  disabled={crearMutation.isPending}
                  aria-invalid={Boolean(formErrors.cantidadPersonas)}
                  onChange={(e) => setCantidadPersonas(e.target.value)}
                  className={cn(
                    'h-control px-3 w-full bg-surface border border-border rounded-control text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-gray-100 disabled:cursor-not-allowed',
                    formErrors.cantidadPersonas &&
                      'border-red-500 focus:border-red-500 focus:ring-red-500',
                  )}
                />
                <div className="flex items-center gap-1 shrink-0">
                  {AFOROS_RAPIDOS.map((num) => {
                    const isSelected = Number(cantidadPersonas) === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={crearMutation.isPending}
                        onClick={() => setCantidadPersonas(String(num))}
                        className={cn(
                          'h-control px-2.5 text-xs font-medium rounded-control border transition-colors',
                          isSelected
                            ? 'bg-primary-soft border-primary text-primary font-semibold'
                            : 'bg-surface border-border text-muted hover:text-ink',
                        )}
                      >
                        {num}p
                      </button>
                    );
                  })}
                </div>
              </div>
              {formErrors.cantidadPersonas && (
                <span role="alert" className="text-xs text-red-600">
                  {formErrors.cantidadPersonas}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={crearMutation.isPending}
              className="h-control px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary"
            >
              {crearMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Registrar en espera</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Panel de monitoreo de la fila presencial (FIFO) */}
      <div className="bg-surface border border-border rounded-card p-4 sm:p-6 shadow-subtle space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 id={`${id}-title`} className="text-xl font-bold text-ink">
              Lista de espera presencial
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Fila ordenada por hora de llegada (FIFO). Al liberarse una mesa compatible se notifica
              automáticamente al primer turno en espera.
            </p>
          </div>
        </div>

        {/* Pestañas por estado */}
        <div className="border-b border-border pb-3">
          <nav
            role="tablist"
            aria-label="Filtrar lista de espera por estado"
            className="flex items-center gap-4 sm:gap-6 overflow-x-auto"
          >
            {PESTAÑAS_ESTADO_ESPERA.map((tab, index) => {
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
                          ? PESTAÑAS_ESTADO_ESPERA.length - 1
                          : (index +
                              (event.key === 'ArrowRight' ? 1 : -1) +
                              PESTAÑAS_ESTADO_ESPERA.length) %
                            PESTAÑAS_ESTADO_ESPERA.length;
                    setSelectedEstado(PESTAÑAS_ESTADO_ESPERA[next].key);
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
        </div>

        {/* Estado de Carga: Skeletons animados */}
        {esperaQuery.isLoading && (
          <div
            data-testid="espera-loading-skeletons"
            aria-busy="true"
            aria-label="Cargando lista de espera"
            className="space-y-3"
          >
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                data-testid="espera-skeleton"
                className="animate-pulse bg-gray-200 rounded-card h-20 p-4 flex items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-36 bg-gray-300 rounded" />
                  <div className="h-3 w-48 bg-gray-300 rounded" />
                </div>
                <div className="h-6 w-24 bg-gray-300 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* Estado de Error */}
        {esperaQuery.isError && (
          <div
            role="alert"
            data-testid="espera-error-banner"
            className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-card text-center space-y-3"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-1">
              <AlertCircle className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-red-900">Error al cargar la lista de espera</h3>
            <p className="text-sm text-red-700 max-w-md mx-auto">
              {esperaQuery.error instanceof Error
                ? esperaQuery.error.message
                : 'No se pudo obtener la fila de espera actual.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  void esperaQuery.refetch();
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
        {!esperaQuery.isLoading && !esperaQuery.isError && colaOrdenada.length === 0 && (
          <div
            data-testid="espera-empty-state"
            className="bg-canvas border border-border rounded-card p-10 text-center flex flex-col items-center justify-center space-y-2"
          >
            <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-muted">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-ink">No hay clientes en la lista de espera</h3>
            <p className="text-sm text-muted max-w-md">
              {selectedEstado === 'Activos'
                ? 'Actualmente no hay comensales esperando mesa en la fila presencial.'
                : `No hay registros en estado "${selectedEstado}".`}
            </p>
          </div>
        )}

        {/* Tabla / Tarjetas responsivas de la fila en orden FIFO */}
        {!esperaQuery.isLoading && !esperaQuery.isError && colaOrdenada.length > 0 && (
          <div className="border border-border rounded-card overflow-hidden">
            <table className="w-full text-sm" aria-label="Cola de lista de espera">
              <thead className="hidden md:table-header-group bg-canvas text-xs font-semibold text-muted uppercase tracking-wider border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    Turno
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Personas
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Tiempo de espera
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Mesa asignada
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border block md:table-row-group">
                {colaOrdenada.map((item, idx) => {
                  const tiempoEspera = formatTiempoOcupada(item.horaLlegada, ahora) ?? '0 min';
                  const horaLlegadaTexto = formatHoraLlegada(item.horaLlegada);
                  const mesaLabel = formatMesaLabel(item.idMesaAsignada);
                  const esActivo =
                    item.estado === EstadoEspera.EN_ESPERA ||
                    item.estado === EstadoEspera.NOTIFICADO;
                  const estaProcesando = pendingEsperaId === item.esperaId;

                  return (
                    <tr
                      key={item.esperaId}
                      data-testid={`espera-row-${item.esperaId}`}
                      className={cn(
                        'flex flex-col md:table-row p-4 md:p-0 gap-2 md:gap-0 transition-colors',
                        item.estado === EstadoEspera.NOTIFICADO
                          ? 'bg-primary-soft/50 hover:bg-primary-soft'
                          : 'hover:bg-canvas/60',
                      )}
                    >
                      <td className="block md:table-cell md:px-4 md:py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-control bg-canvas border border-border text-xs font-bold text-ink tabular-nums">
                          #{idx + 1}
                        </span>
                      </td>

                      <td className="block md:table-cell md:px-4 md:py-3.5">
                        <div className="font-semibold text-ink">{item.nombreCliente}</div>
                        <div className="text-xs text-muted inline-flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>{item.telefonoContacto}</span>
                        </div>
                      </td>

                      <td className="block md:table-cell md:px-4 md:py-3.5 md:text-right tabular-nums">
                        <span className="inline-flex items-center md:justify-end gap-1 text-text font-medium">
                          <Users className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                          <span>
                            {item.cantidadPersonas}{' '}
                            {item.cantidadPersonas === 1 ? 'persona' : 'personas'}
                          </span>
                        </span>
                      </td>

                      <td className="block md:table-cell md:px-4 md:py-3.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-medium text-ink tabular-nums">
                          <Clock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                          <span>{tiempoEspera}</span>
                          <span className="text-xs text-muted">({horaLlegadaTexto})</span>
                        </div>
                      </td>

                      <td className="block md:table-cell md:px-4 md:py-3.5">
                        {mesaLabel ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary-soft border border-primary/30 px-2.5 py-1 rounded-control">
                            <span>{mesaLabel}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Sin mesa asignada</span>
                        )}
                      </td>

                      <td className="block md:table-cell md:px-4 md:py-3.5 md:text-right">
                        <EstadoEsperaBadge estado={item.estado} />
                      </td>

                      <td className="block md:table-cell md:px-4 md:py-3.5">
                        {esActivo ? (
                          <div className="flex flex-wrap md:justify-end gap-2">
                            <button
                              type="button"
                              disabled={estaProcesando}
                              onClick={() => handleCambiarEstado(item, EstadoEspera.SENTADO)}
                              className="h-control px-3 bg-primary hover:bg-primary-hover text-white rounded-control text-sm font-medium transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <span>Sentar cliente</span>
                            </button>

                            {item.estado === EstadoEspera.NOTIFICADO && (
                              <button
                                type="button"
                                disabled={estaProcesando}
                                onClick={() => handleCambiarEstado(item, EstadoEspera.EN_ESPERA)}
                                className="h-control px-3 bg-surface border border-border hover:bg-canvas text-text rounded-control text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                Volver a espera
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={estaProcesando}
                              onClick={() => handleCambiarEstado(item, EstadoEspera.CANCELADO)}
                              className="h-control px-3 bg-surface border border-border hover:bg-red-50 text-red-700 rounded-control text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              Cancelar espera
                            </button>
                          </div>
                        ) : (
                          <div className="md:text-right">
                            <span className="text-xs text-muted">Sin acciones</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
