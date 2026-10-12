import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ChevronDown, AlertTriangle, Clock, Loader2, AlertCircle } from 'lucide-react';
import {
  EstadoReserva,
  EstadoEspera,
  fixtureMeserosCatalogo,
  fixtureReservas,
  fixtureListaEspera,
  type MesaEnVivoDto,
  type MeseroCatalogoItem,
  type ReservaDto,
  type EsperaDto,
  type OcuparMesaRequestDto,
  type OcuparMesaResponseDto,
} from '@floor/shared';
import { ocuparMesa } from '../../api/services/mesas.service';
import { queryKeys } from '../../api/queryKeys';
import { isApiError } from '../../api/error';
import { cn } from '../../lib/utils';

export interface OcuparMesaModalProps {
  readonly mesa: MesaEnVivoDto | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: (response: OcuparMesaResponseDto) => void;
  readonly meserosCatalogo?: readonly MeseroCatalogoItem[];
  readonly reservasCatalogo?: readonly ReservaDto[];
  readonly esperaCatalogo?: readonly EsperaDto[];
}

export function OcuparMesaModal({
  mesa,
  isOpen,
  onClose,
  onSuccess,
  meserosCatalogo = fixtureMeserosCatalogo,
  reservasCatalogo = fixtureReservas,
  esperaCatalogo = fixtureListaEspera,
}: OcuparMesaModalProps): React.JSX.Element | null {
  const queryClient = useQueryClient();

  const [comensales, setComensales] = useState<number | ''>(1);
  const [meseroId, setMeseroId] = useState<string>('');
  const [forzarSobrecupo, setForzarSobrecupo] = useState<boolean>(false);
  const [forzarOcupacion, setForzarOcupacion] = useState<boolean>(false);
  const [reservaId, setReservaId] = useState<string>('');
  const [esperaId, setEsperaId] = useState<string>('');
  const [mostrarOpcionesAvanzadas, setMostrarOpcionesAvanzadas] = useState(false);

  // Estados para advertencias provocadas por 409 del backend
  const [mostrarSobrecupoBackend, setMostrarSobrecupoBackend] = useState(false);
  const [mostrarReservaProximaBackend, setMostrarReservaProximaBackend] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);

  // Catálogo filtrado de reservas confirmadas activas
  const reservasDisponibles = React.useMemo(() => {
    return reservasCatalogo.filter((r) => r.estado === EstadoReserva.CONFIRMADA);
  }, [reservasCatalogo]);

  // Catálogo filtrado de lista de espera activa (en espera o notificado)
  const esperaDisponible = React.useMemo(() => {
    return esperaCatalogo.filter(
      (e) => e.estado === EstadoEspera.EN_ESPERA || e.estado === EstadoEspera.NOTIFICADO,
    );
  }, [esperaCatalogo]);

  const ocuparMutation = useMutation({
    mutationFn: (dto: OcuparMesaRequestDto) => {
      if (!mesa) throw new Error('No hay mesa seleccionada');
      return ocuparMesa(mesa.mesaId, dto);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all });
      onClose();
      onSuccess?.(data);
    },
    onError: (error: unknown) => {
      if (isApiError(error)) {
        if (error.code === 'SOBRECUPO_DETECTADO') {
          setMostrarSobrecupoBackend(true);
        }
        if (error.code === 'RESERVA_PROXIMA_PRESENTE') {
          setMostrarReservaProximaBackend(true);
        }
        setErrorApi(error.message);
      } else if (error instanceof Error) {
        setErrorApi(error.message);
      } else {
        setErrorApi('Error al ocupar la mesa');
      }
    },
  });

  useEffect(() => {
    if (isOpen && mesa) {
      setComensales(1);
      setMeseroId(mesa.meseroId ?? '');
      setForzarSobrecupo(false);
      setForzarOcupacion(false);
      setReservaId('');
      setEsperaId('');
      setMostrarOpcionesAvanzadas(false);
      setMostrarSobrecupoBackend(false);
      setMostrarReservaProximaBackend(false);
      setErrorApi(null);
    }
  }, [isOpen, mesa]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ocuparMutation.isPending) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, ocuparMutation.isPending]);

  if (!isOpen || !mesa) {
    return null;
  }

  const comensalesNum = typeof comensales === 'number' ? comensales : parseInt(comensales, 10);
  const comensalesValido = Number.isInteger(comensalesNum) && comensalesNum >= 1;
  const meseroValido = Boolean(meseroId && meseroId.trim().length > 0);

  // Detección reactiva de sobrecupo (RN-02)
  const haySobrecupo = comensalesValido ? comensalesNum > mesa.capacidad : false;
  const debeMostrarSobrecupo = haySobrecupo || mostrarSobrecupoBackend;

  // Detección reactiva de reserva próxima (RN-05)
  const hayReservaProxima = Boolean(mesa.tieneReservaProxima);
  const debeMostrarReservaProxima = hayReservaProxima || mostrarReservaProximaBackend;

  // Si hay sobrecupo o reserva próxima, se requiere confirmación explícita
  const bloqueadoPorSobrecupo = debeMostrarSobrecupo && !forzarSobrecupo;
  const bloqueadoPorReserva = debeMostrarReservaProxima && !forzarOcupacion;

  const isFormValid =
    comensalesValido && meseroValido && !bloqueadoPorSobrecupo && !bloqueadoPorReserva;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || ocuparMutation.isPending) return;

    setErrorApi(null);

    const payload: OcuparMesaRequestDto = {
      comensales: comensalesNum,
      meseroId,
      ...(forzarSobrecupo ? { forzarSobrecupo: true } : {}),
      ...(forzarOcupacion ? { forzarOcupacion: true } : {}),
      ...(reservaId.trim() ? { reservaId: reservaId.trim() } : {}),
      ...(esperaId.trim() ? { esperaId: esperaId.trim() } : {}),
    };

    ocuparMutation.mutate(payload);
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !ocuparMutation.isPending) {
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocupar-mesa-modal-title"
        aria-describedby="ocupar-mesa-modal-desc"
        className="bg-surface rounded-card border border-border shadow-xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto"
      >
        {/* Botón X de cierre */}
        <button
          type="button"
          aria-label="Cerrar modal"
          onClick={onClose}
          disabled={ocuparMutation.isPending}
          className="absolute top-4 right-4 text-muted hover:text-ink p-1 rounded-control transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Encabezado */}
        <div className="pr-8">
          <h2 id="ocupar-mesa-modal-title" className="text-xl font-bold text-ink">
            Ocupar Mesa {mesa.numeroMesa}
          </h2>
          <p id="ocupar-mesa-modal-desc" className="text-sm text-muted mt-1">
            Capacidad máxima: {mesa.capacidad} personas · Zona: {mesa.zona}
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Comensales */}
          <div>
            <label htmlFor="comensales" className="block text-sm font-medium text-text mb-1">
              Número de comensales <span className="text-red-500">*</span>
            </label>
            <input
              id="comensales"
              name="comensales"
              type="number"
              min={1}
              value={comensales}
              disabled={ocuparMutation.isPending}
              onChange={(e) => {
                const val = e.target.value;
                setComensales(val === '' ? '' : parseInt(val, 10));
              }}
              className={cn(
                'h-10 px-3 rounded-control border border-border focus:ring-2 focus:ring-primary w-full outline-none transition-colors text-ink text-sm disabled:bg-gray-100 disabled:cursor-not-allowed',
                !comensalesValido && comensales !== '' && 'border-red-500 focus:ring-red-500',
              )}
              placeholder="Ej. 2"
              required
            />
            {!comensalesValido && comensales !== '' && (
              <p className="text-xs text-red-600 mt-1">
                El número de comensales debe ser un entero mayor o igual a 1.
              </p>
            )}
          </div>

          {/* Advertencia de Sobrecupo (RN-02) */}
          {debeMostrarSobrecupo && (
            <div
              data-testid="alerta-sobrecupo"
              className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                <span>Aforo excedido</span>
              </div>
              <p className="text-xs text-amber-800">
                La mesa tiene capacidad para {mesa.capacidad} personas y se registraron{' '}
                {comensalesNum}.
              </p>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer mt-1 select-none">
                <input
                  type="checkbox"
                  checked={forzarSobrecupo}
                  disabled={ocuparMutation.isPending}
                  onChange={(e) => setForzarSobrecupo(e.target.checked)}
                  className="rounded text-primary focus:ring-primary h-4 w-4"
                />
                <span>Autorizar sobrecupo para esta mesa</span>
              </label>
            </div>
          )}

          {/* Advertencia de Reserva Próxima (RN-05) */}
          {debeMostrarReservaProxima && (
            <div
              data-testid="alerta-reserva-proxima"
              className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-sm flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 font-medium">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                <span>Reserva próxima programada</span>
              </div>
              <p className="text-xs text-blue-800">
                Esta mesa tiene una reserva confirmada en los próximos 30 minutos.
              </p>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer mt-1 select-none">
                <input
                  type="checkbox"
                  checked={forzarOcupacion}
                  disabled={ocuparMutation.isPending}
                  onChange={(e) => setForzarOcupacion(e.target.checked)}
                  className="rounded text-primary focus:ring-primary h-4 w-4"
                />
                <span>Ocupar de todos modos (tiempo de servicio limitado)</span>
              </label>
            </div>
          )}

          {/* Banner de error de API */}
          {errorApi && (
            <div
              role="alert"
              data-testid="alerta-error-api"
              className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-xs flex-1">{errorApi}</div>
            </div>
          )}

          {/* Mesero responsable */}
          <div>
            <label htmlFor="meseroId" className="block text-sm font-medium text-text mb-1">
              Mesero responsable <span className="text-red-500">*</span>
            </label>
            <select
              id="meseroId"
              name="meseroId"
              value={meseroId}
              disabled={ocuparMutation.isPending}
              onChange={(e) => setMeseroId(e.target.value)}
              className="h-10 px-3 rounded-control border border-border focus:ring-2 focus:ring-primary w-full bg-white outline-none transition-colors text-ink text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              required
            >
              <option value="">Selecciona un mesero...</option>
              {meserosCatalogo.map((mesero) => (
                <option key={mesero.meseroId} value={mesero.meseroId}>
                  {mesero.nombre}
                </option>
              ))}
            </select>
            {!meseroValido && (
              <p className="text-xs text-muted mt-1">
                Selecciona al mesero responsable asignado a esta mesa.
              </p>
            )}
          </div>

          {/* Opciones avanzadas (colapsable) */}
          <div className="pt-1">
            <button
              type="button"
              disabled={ocuparMutation.isPending}
              onClick={() => setMostrarOpcionesAvanzadas(!mostrarOpcionesAvanzadas)}
              className="text-xs text-muted hover:text-ink font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-200',
                  mostrarOpcionesAvanzadas && 'rotate-180',
                )}
                aria-hidden="true"
              />
              <span>Opciones avanzadas (Reserva / Espera)</span>
            </button>

            {mostrarOpcionesAvanzadas && (
              <div className="mt-2 p-3 bg-canvas border border-border rounded-control space-y-3">
                {/* Selector de Reserva */}
                <div>
                  <label htmlFor="reservaId" className="block text-xs font-medium text-text mb-1">
                    Reserva asociada (opcional)
                  </label>
                  <select
                    id="reservaId"
                    name="reservaId"
                    value={reservaId}
                    disabled={ocuparMutation.isPending}
                    onChange={(e) => {
                      const id = e.target.value;
                      setReservaId(id);
                      if (id) {
                        const res = reservasDisponibles.find((r) => r.reservaId === id);
                        if (res) {
                          setComensales(res.cantidadPersonas);
                        }
                      }
                    }}
                    className="h-9 px-2.5 text-xs rounded-control border border-border focus:ring-2 focus:ring-primary w-full bg-white outline-none text-ink disabled:bg-gray-100"
                  >
                    <option value="">Sin reserva vinculada</option>
                    {reservasDisponibles.map((res) => (
                      <option key={res.reservaId} value={res.reservaId}>
                        {res.nombreContacto} · {res.cantidadPersonas} pers. ({res.horaInicio})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selector de Lista de Espera */}
                <div>
                  <label htmlFor="esperaId" className="block text-xs font-medium text-text mb-1">
                    Turno en lista de espera (opcional)
                  </label>
                  <select
                    id="esperaId"
                    name="esperaId"
                    value={esperaId}
                    disabled={ocuparMutation.isPending}
                    onChange={(e) => {
                      const id = e.target.value;
                      setEsperaId(id);
                      if (id) {
                        const esp = esperaDisponible.find((item) => item.esperaId === id);
                        if (esp) {
                          setComensales(esp.cantidadPersonas);
                        }
                      }
                    }}
                    className="h-9 px-2.5 text-xs rounded-control border border-border focus:ring-2 focus:ring-primary w-full bg-white outline-none text-ink disabled:bg-gray-100"
                  >
                    <option value="">Sin turno en lista de espera</option>
                    {esperaDisponible.map((esp) => (
                      <option key={esp.esperaId} value={esp.esperaId}>
                        {esp.nombreCliente} · {esp.cantidadPersonas} pers.
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Botonera inferior */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={ocuparMutation.isPending}
              className="h-10 px-4 bg-white border border-border text-text rounded-control hover:bg-gray-50 text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || ocuparMutation.isPending}
              className="h-10 px-4 bg-primary hover:bg-primary-hover text-white rounded-control font-medium inline-flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
            >
              {ocuparMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Ocupando...</span>
                </>
              ) : (
                <span>Confirmar Ocupación</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
