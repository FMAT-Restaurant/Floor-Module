import React, { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { CrearUnionResponseDto, MesaEnVivoDto, MeseroCatalogoItem } from '@floor/shared';
import { crearUnion } from '../../api/services/uniones.service';
import { queryKeys } from '../../api/queryKeys';
import { isApiError } from '../../api/error';
import { calcularAforoTotal, formatListaMesas } from '../../lib/uniones';

export interface UnirMesasPanelProps {
  readonly mesas: readonly MesaEnVivoDto[];
  readonly meserosCatalogo: readonly MeseroCatalogoItem[];
  readonly onCancel: () => void;
  readonly onSuccess: (response: CrearUnionResponseDto, mesas: readonly MesaEnVivoDto[]) => void;
}

interface ForzarFlags {
  readonly forzarOcupacion: boolean;
  readonly forzarSobrecupo: boolean;
}

interface PanelError {
  readonly mensaje: string;
  readonly advertencia?: 'reserva' | 'sobrecupo';
}

const SIN_FLAGS: ForzarFlags = { forzarOcupacion: false, forzarSobrecupo: false };

const secondaryClass =
  'h-control px-4 border border-border bg-surface text-text text-sm font-medium rounded-control hover:bg-canvas inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed';
const primaryClass =
  'h-control px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-control inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed';
const fieldClass =
  'h-control w-full px-3 border border-border bg-surface text-sm rounded-control focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50';

function traducirError(error: unknown): PanelError {
  if (!isApiError(error)) {
    return { mensaje: 'No se pudo crear la unión. Revisa tu conexión e inténtalo de nuevo.' };
  }
  switch (error.code) {
    case 'ZONA_INCOMPATIBLE':
      return { mensaje: 'Todas las mesas de la unión deben pertenecer a la misma zona (RN-12).' };
    case 'MESA_NO_DISPONIBLE':
      return {
        mensaje:
          'Alguna de las mesas seleccionadas ya no está libre. Revisa el plano e inténtalo de nuevo.',
      };
    case 'MESA_EN_UNION':
      return { mensaje: 'Alguna de las mesas seleccionadas ya pertenece a otra unión.' };
    case 'RESERVA_PROXIMA_PRESENTE':
      return {
        mensaje:
          'Una o más mesas tienen una reserva próxima (menos de 30 min). Puedes unirlas de todos modos.',
        advertencia: 'reserva',
      };
    case 'SOBRECUPO_DETECTADO':
      return {
        mensaje: 'El número de comensales supera el aforo total de las mesas unidas.',
        advertencia: 'sobrecupo',
      };
    default:
      return { mensaje: error.message || 'No se pudo crear la unión.' };
  }
}

export function UnirMesasPanel({
  mesas,
  meserosCatalogo,
  onCancel,
  onSuccess,
}: Readonly<UnirMesasPanelProps>): React.JSX.Element {
  const queryClient = useQueryClient();
  const meseroFieldId = useId();
  const comensalesFieldId = useId();

  const [meseroId, setMeseroId] = useState('');
  // null = usar el aforo total como valor por defecto sin sincronizar con efectos
  const [comensalesInput, setComensalesInput] = useState<string | null>(null);
  const [forzar, setForzar] = useState<ForzarFlags>(SIN_FLAGS);
  const [error, setError] = useState<PanelError | null>(null);

  const meserosActivos = meserosCatalogo.filter((mesero) => mesero.activo);
  const aforoTotal = calcularAforoTotal(mesas);
  const comensales = comensalesInput === null ? aforoTotal : Number(comensalesInput);
  const comensalesValidos = Number.isInteger(comensales) && comensales >= 1;
  const puedeUnir = mesas.length >= 2 && meseroId !== '' && comensalesValidos;

  const unionMutation = useMutation({
    mutationFn: (flags: ForzarFlags) =>
      crearUnion({
        mesasIds: mesas.map((mesa) => mesa.mesaId),
        totalPersonas: comensales,
        meseroId,
        ...(flags.forzarOcupacion ? { forzarOcupacion: true } : {}),
        ...(flags.forzarSobrecupo ? { forzarSobrecupo: true } : {}),
      }),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.uniones.all }),
      ]);
      onSuccess(response, mesas);
    },
    onError: (err) => {
      setError(traducirError(err));
    },
  });

  const pending = unionMutation.isPending;

  const enviar = (flags: ForzarFlags) => {
    if (!puedeUnir || pending) return;
    setError(null);
    setForzar(flags);
    unionMutation.mutate(flags);
  };

  const forzarAdvertencia = () => {
    if (!error?.advertencia) return;
    enviar({
      ...forzar,
      forzarOcupacion: forzar.forzarOcupacion || error.advertencia === 'reserva',
      forzarSobrecupo: forzar.forzarSobrecupo || error.advertencia === 'sobrecupo',
    });
  };

  return (
    <section
      aria-label="Unión de mesas"
      className="sticky bottom-4 z-40 bg-surface border border-primary/30 rounded-card shadow-lg p-4 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-ink">Unir mesas</h3>
          <p className="text-sm text-muted">
            {mesas.length === 0
              ? 'Selecciona al menos 2 mesas libres de la misma zona.'
              : `Mesas seleccionadas: ${formatListaMesas(mesas.map((mesa) => mesa.numeroMesa))}`}
          </p>
          {mesas.length === 1 && (
            <p className="text-xs text-muted">Selecciona al menos una mesa más para unir.</p>
          )}
        </div>
        <p className="text-sm text-text">
          Aforo total:{' '}
          <strong data-testid="aforo-total" className="text-ink">
            {aforoTotal} personas
          </strong>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={meseroFieldId} className="block text-sm font-medium text-text mb-1">
            Mesero responsable
          </label>
          <select
            id={meseroFieldId}
            value={meseroId}
            onChange={(event) => setMeseroId(event.target.value)}
            disabled={pending || meserosActivos.length === 0}
            className={fieldClass}
          >
            <option value="">Selecciona un mesero</option>
            {meserosActivos.map((mesero) => (
              <option key={mesero.meseroId} value={mesero.meseroId}>
                {mesero.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={comensalesFieldId} className="block text-sm font-medium text-text mb-1">
            Comensales
          </label>
          <input
            id={comensalesFieldId}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={comensalesInput ?? String(aforoTotal)}
            onChange={(event) => setComensalesInput(event.target.value)}
            disabled={pending}
            aria-invalid={!comensalesValidos}
            className={fieldClass}
          />
          {!comensalesValidos && (
            <p className="text-xs text-red-700 mt-1">Ingresa un número de comensales válido.</p>
          )}
          {comensalesValidos && aforoTotal > 0 && comensales > aforoTotal && (
            <p role="status" className="text-xs text-amber-800 mt-1">
              Supera el aforo total ({aforoTotal}). Se te pedirá confirmar el sobrecupo.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className={
            error.advertencia
              ? 'flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-control text-sm'
              : 'flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 p-3 rounded-control text-sm'
          }
        >
          {error.advertencia ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <span>{error.mensaje}</span>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border">
        <button type="button" className={secondaryClass} onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
        {error?.advertencia && (
          <button
            type="button"
            className={secondaryClass}
            onClick={forzarAdvertencia}
            disabled={!puedeUnir || pending}
          >
            Unir de todos modos
          </button>
        )}
        <button
          type="button"
          className={primaryClass}
          onClick={() => enviar(forzar)}
          disabled={!puedeUnir || pending}
        >
          {pending && (
            <Loader2
              className="w-4 h-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {pending ? 'Uniendo…' : 'Unir mesas'}
        </button>
      </div>
    </section>
  );
}
