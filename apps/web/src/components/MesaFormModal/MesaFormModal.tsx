import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  actualizarMesaSchema,
  crearMesaSchema,
  type ActualizarMesaRequestDto,
  type CrearMesaRequestDto,
  type MesaDto,
} from '@floor/shared';
import { actualizarMesa, crearMesa } from '../../api/services/mesas.service';
import { isApiError } from '../../api/error';
import { queryKeys } from '../../api/queryKeys';
import { Modal } from '../Modal';

interface MesaFormModalProps {
  readonly mesa: MesaDto | null;
  readonly mesas: readonly MesaDto[];
  readonly onClose: () => void;
  readonly onSuccess: (mesa: MesaDto) => void;
}

type Campo = 'numeroMesa' | 'capacidad' | 'zona';
const fields = [
  { key: 'numeroMesa', label: 'Número de mesa', type: 'number', placeholder: 'Ej. 9' },
  { key: 'capacidad', label: 'Capacidad (personas)', type: 'number', placeholder: 'Ej. 4' },
  { key: 'zona', label: 'Zona', type: 'text', placeholder: 'Ej. Terraza' },
] as const;

export function MesaFormModal({ mesa, mesas, onClose, onSuccess }: MesaFormModalProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    numeroMesa: mesa ? String(mesa.numeroMesa) : '',
    capacidad: mesa ? String(mesa.capacidad) : '',
    zona: mesa?.zona ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Campo, string>>>({});
  const [errorApi, setErrorApi] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: ActualizarMesaRequestDto) =>
      mesa ? actualizarMesa(mesa.mesaId, data) : crearMesa(data as CrearMesaRequestDto),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all }),
      ]);
      onSuccess(saved);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'NUMERO_MESA_DUPLICADO') {
        setErrors({ numeroMesa: 'Este número ya está en uso. Elige otro número.' });
        void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all });
      } else {
        setErrorApi(
          isApiError(error)
            ? error.message
            : 'No se pudo guardar la mesa. Revisa tu conexión e inténtalo de nuevo.',
        );
      }
    },
  });

  const data = {
    numeroMesa: Number(values.numeroMesa),
    capacidad: Number(values.capacidad),
    zona: values.zona.trim(),
  };
  const changes: ActualizarMesaRequestDto = mesa
    ? {
        ...(data.numeroMesa !== mesa.numeroMesa ? { numeroMesa: data.numeroMesa } : {}),
        ...(data.capacidad !== mesa.capacidad ? { capacidad: data.capacidad } : {}),
        ...(data.zona !== mesa.zona ? { zona: data.zona } : {}),
      }
    : data;
  const unchanged = Boolean(mesa && Object.keys(changes).length === 0);

  return (
    <Modal
      title={mesa ? `Editar Mesa ${mesa.numeroMesa}` : 'Crear mesa'}
      description="Define el número, la capacidad y la zona. El número debe ser único entre las mesas activas."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        noValidate
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (mutation.isPending || unchanged) return;
          setErrorApi(null);
          const parsed = mesa
            ? actualizarMesaSchema.safeParse(changes)
            : crearMesaSchema.safeParse(changes);
          if (!parsed.success) {
            const fieldErrors: Partial<Record<Campo, string>> = {};
            parsed.error.issues.forEach((issue) => {
              const field = issue.path[0] as Campo;
              if (fields.some((item) => item.key === field))
                fieldErrors[field] ??=
                  field === 'zona' ? issue.message : 'Ingresa un número entero mayor o igual a 1.';
              else setErrorApi(issue.message);
            });
            setErrors(fieldErrors);
            return;
          }
          if (
            mesas.some(
              (other) =>
                other.activo &&
                other.mesaId !== mesa?.mesaId &&
                other.numeroMesa === data.numeroMesa,
            )
          ) {
            setErrors({ numeroMesa: 'Este número ya está en uso. Elige otro número.' });
            return;
          }
          setErrors({});
          mutation.mutate(parsed.data);
        }}
      >
        {fields.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={`${id}-${field.key}`}
              className="block text-sm font-medium text-text mb-1"
            >
              {field.label}
            </label>
            <input
              id={`${id}-${field.key}`}
              type={field.type}
              min={field.type === 'number' ? 1 : undefined}
              step={field.type === 'number' ? 1 : undefined}
              maxLength={field.key === 'zona' ? 50 : undefined}
              required
              value={values[field.key]}
              placeholder={field.placeholder}
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={errors[field.key] ? `${id}-${field.key}-error` : undefined}
              onChange={(event) => {
                setValues((previous) => ({ ...previous, [field.key]: event.target.value }));
                setErrors((previous) => ({ ...previous, [field.key]: undefined }));
                setErrorApi(null);
              }}
              className="h-control w-full px-3 bg-surface border border-border rounded-control text-sm focus-visible:ring-2 focus-visible:ring-primary aria-[invalid=true]:border-red-500 disabled:opacity-50"
            />
            {errors[field.key] && (
              <p role="alert" id={`${id}-${field.key}-error`} className="text-sm text-red-700 mt-1">
                {errors[field.key]}
              </p>
            )}
          </div>
        ))}
        {errorApi && (
          <p role="alert" className="text-sm text-red-700">
            {errorApi}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="h-control px-4 border border-border rounded-control text-sm font-medium hover:bg-canvas disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || unchanged}
            className="h-control px-4 bg-primary hover:bg-primary-hover text-white rounded-control text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {mutation.isPending && (
              <Loader2
                className="w-4 h-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {mutation.isPending ? 'Guardando…' : mesa ? 'Guardar cambios' : 'Crear mesa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
