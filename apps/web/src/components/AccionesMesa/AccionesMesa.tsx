import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, LogOut, UserRound } from 'lucide-react';
import { EstadoMesa, type MesaEnVivoDto, type MeseroCatalogoItem } from '@floor/shared';
import { asignarMesero, cambiarEstadoMesa } from '../../api/services/mesas.service';
import { queryKeys } from '../../api/queryKeys';
import { isApiError } from '../../api/error';
import { OperacionMesaModal } from './OperacionMesaModal';

export interface AccionesMesaProps {
  readonly mesa: MesaEnVivoDto;
  readonly meserosCatalogo: readonly MeseroCatalogoItem[];
}

const secondaryClass =
  'h-control px-3 border border-border bg-surface text-text text-sm font-medium rounded-control hover:bg-canvas inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed';
const primaryClass =
  'h-control px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-control inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed';

function mutationError(error: unknown, action: string): string {
  return isApiError(error)
    ? `${action}: ${error.message}`
    : `${action}. Revisa tu conexión e inténtalo de nuevo.`;
}

export function AccionesMesa({ mesa, meserosCatalogo }: AccionesMesaProps) {
  const queryClient = useQueryClient();
  const selectId = useId();
  const [modal, setModal] = useState<'salida' | 'mesero' | null>(null);
  const [meseroId, setMeseroId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const meserosActivos = meserosCatalogo.filter((mesero) => mesero.activo);

  const estadoMutation = useMutation({
    mutationFn: (estado: EstadoMesa.LIBRE | EstadoMesa.LIMPIEZA_PENDIENTE) =>
      cambiarEstadoMesa(mesa.mesaId, { estado }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.espera.all }),
      ]);
      setModal(null);
      setNotice(
        data.estado === EstadoMesa.LIBRE
          ? `Mesa ${mesa.numeroMesa} marcada como limpia.`
          : `Salida registrada. Mesa ${mesa.numeroMesa} pendiente de limpieza.`,
      );
    },
    onError: (failure) => {
      setError(mutationError(failure, 'No se pudo cambiar el estado de la mesa'));
      if (isApiError(failure) && failure.statusCode === 409) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all });
      }
    },
  });

  const meseroMutation = useMutation({
    mutationFn: (id: string) => asignarMesero(mesa.mesaId, { meseroId: id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all });
      setModal(null);
      setNotice(`Mesero responsable de Mesa ${mesa.numeroMesa} actualizado.`);
    },
    onError: (failure) => {
      setError(mutationError(failure, 'No se pudo asignar el mesero'));
    },
  });

  const pending = estadoMutation.isPending || meseroMutation.isPending;
  const puedeCambiarEstado = mesa.activo && !mesa.unionId;
  const esSalida = mesa.estadoFisico === EstadoMesa.OCUPADA;
  const esLimpieza = mesa.estadoFisico === EstadoMesa.LIMPIEZA_PENDIENTE;
  const puedeAsignar =
    mesa.activo &&
    meserosActivos.some((m) => m.meseroId === meseroId) &&
    meseroId !== mesa.meseroId;

  const clearFeedback = () => {
    setError(null);
    setNotice(null);
  };
  const closeModal = () => {
    if (pending) return;
    setModal(null);
    setError(null);
  };

  return (
    <div className="space-y-2" aria-label={`Acciones de Mesa ${mesa.numeroMesa}`}>
      {(esSalida || esLimpieza) && (
        <button
          type="button"
          className={`${primaryClass} w-full`}
          disabled={pending || !puedeCambiarEstado}
          onClick={(event) => {
            event.currentTarget.focus();
            clearFeedback();
            if (esSalida) setModal('salida');
            else estadoMutation.mutate(EstadoMesa.LIBRE);
          }}
        >
          {estadoMutation.isPending ? (
            <Loader2
              className="w-4 h-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : esSalida ? (
            <LogOut className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Check className="w-4 h-4" aria-hidden="true" />
          )}
          {esSalida ? 'Salida de comensales' : 'Marcar limpia'}
        </button>
      )}
      {mesa.unionId && (
        <p className="text-xs text-muted">
          Libera la unión para registrar la salida de estas mesas.
        </p>
      )}
      <button
        type="button"
        className={`${secondaryClass} w-full`}
        disabled={pending || !mesa.activo}
        onClick={(event) => {
          event.currentTarget.focus();
          clearFeedback();
          setMeseroId(mesa.meseroId ?? '');
          setModal('mesero');
        }}
      >
        <UserRound className="w-4 h-4" aria-hidden="true" />
        {mesa.meseroId ? 'Reasignar mesero' : 'Asignar mesero'}
      </button>
      {notice && (
        <p role="status" className="text-xs text-emerald-800">
          {notice}
        </p>
      )}
      {error && !modal && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {modal && (
        <OperacionMesaModal
          title={
            modal === 'salida'
              ? `Salida de comensales · Mesa ${mesa.numeroMesa}`
              : `Mesero responsable · Mesa ${mesa.numeroMesa}`
          }
          description={
            modal === 'salida'
              ? 'Confirma que los comensales se retiraron. La mesa pasará a Limpieza pendiente.'
              : mesa.meseroId
                ? 'Selecciona al mesero que atenderá esta mesa. La nueva asignación reemplazará a la anterior.'
                : 'Selecciona al mesero que atenderá esta mesa.'
          }
          pending={pending}
          onClose={closeModal}
        >
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              setError(null);
              if (modal === 'salida' && puedeCambiarEstado && esSalida) {
                estadoMutation.mutate(EstadoMesa.LIMPIEZA_PENDIENTE);
              } else if (modal === 'mesero' && puedeAsignar) {
                meseroMutation.mutate(meseroId);
              }
            }}
          >
            {modal === 'mesero' && (
              <div>
                <label htmlFor={selectId} className="block text-sm font-medium text-text mb-1">
                  Mesero responsable
                </label>
                <select
                  id={selectId}
                  value={meseroId}
                  onChange={(event) => setMeseroId(event.target.value)}
                  disabled={pending || !mesa.activo || meserosActivos.length === 0}
                  required
                  className="h-control w-full px-3 border border-border bg-surface text-sm rounded-control focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                >
                  <option value="">Selecciona un mesero</option>
                  {mesa.meseroId && !meserosActivos.some((m) => m.meseroId === mesa.meseroId) && (
                    <option value={mesa.meseroId} disabled>
                      Mesero actual (fuera del catálogo)
                    </option>
                  )}
                  {meserosActivos.map((mesero) => (
                    <option key={mesero.meseroId} value={mesero.meseroId}>
                      {mesero.nombre}
                    </option>
                  ))}
                </select>
                {meserosActivos.length === 0 && (
                  <p className="text-sm text-muted mt-2">
                    No hay meseros disponibles para asignar.
                  </p>
                )}
              </div>
            )}
            {modal === 'salida' && (!puedeCambiarEstado || !esSalida) && (
              <p role="alert" className="text-sm text-red-700">
                La mesa ya no permite registrar esta salida. Cierra el modal y revisa su estado.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                className={`${secondaryClass} px-4`}
                onClick={closeModal}
                disabled={pending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={primaryClass}
                disabled={
                  pending || (modal === 'salida' ? !puedeCambiarEstado || !esSalida : !puedeAsignar)
                }
              >
                {pending && (
                  <Loader2
                    className="w-4 h-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {pending
                  ? 'Guardando…'
                  : modal === 'salida'
                    ? 'Confirmar salida'
                    : 'Guardar asignación'}
              </button>
            </div>
          </form>
        </OperacionMesaModal>
      )}
    </div>
  );
}
