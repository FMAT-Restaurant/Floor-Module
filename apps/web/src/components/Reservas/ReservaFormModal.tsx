import { useId, useState } from 'react';
import {
  actualizarReservaSchema,
  crearReservaSchema,
  type ActualizarReservaRequestDto,
  type CrearReservaRequestDto,
  type MesaDto,
  type ReservaDto,
} from '@floor/shared';
import { actualizarReserva, crearReserva } from '../../api/services/reservas.service';
import { esInicioReservaFuturo, getDuracionReserva } from '../../lib/reservas';
import { Modal } from '../Modal';
import { DatePicker } from '../DatePicker';
import { TimePicker } from '../TimePicker';
import { useReservaMutation } from './useReservaMutation';

export interface ReservaInicial {
  mesaId?: string;
  fecha: string;
  horaInicio?: string;
  duracion?: number;
  cantidadPersonas?: number;
}
interface Props {
  readonly reserva?: ReservaDto;
  readonly inicial: ReservaInicial;
  readonly mesas: readonly MesaDto[];
  readonly onClose: () => void;
  readonly onSuccess: (fecha: string) => void;
}
const control =
  'h-control w-full px-3 border border-border rounded-control bg-surface text-sm focus-visible:ring-2 focus-visible:ring-primary aria-[invalid=true]:border-red-500';
const boton =
  'h-control px-4 rounded-control text-sm font-medium disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary';

export function ReservaFormModal({ reserva, inicial, mesas, onClose, onSuccess }: Props) {
  const id = useId();
  const [values, setValues] = useState(() => ({
    mesaId: reserva?.mesaId ?? inicial.mesaId ?? '',
    fecha: reserva?.fecha ?? inicial.fecha,
    horaInicio: reserva?.horaInicio ?? inicial.horaInicio ?? '19:00',
    duracion: String(reserva ? getDuracionReserva(reserva) : (inicial.duracion ?? 90)),
    cantidadPersonas: String(reserva?.cantidadPersonas ?? inicial.cantidadPersonas ?? 2),
    nombre: reserva?.nombreContacto ?? '',
    tel: reserva?.telefonoContacto ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useReservaMutation(
    (data: CrearReservaRequestDto | ActualizarReservaRequestDto) =>
      reserva
        ? actualizarReserva(reserva.reservaId, data as ActualizarReservaRequestDto)
        : crearReserva(data as CrearReservaRequestDto),
    () => onSuccess(values.fecha),
  );
  function change(field: keyof typeof values, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
    mutation.clearError();
  }
  const base = {
    mesaId: values.mesaId,
    fecha: values.fecha,
    horaInicio: values.horaInicio,
    duracion: Number(values.duracion),
    cantidadPersonas: Number(values.cantidadPersonas),
  };
  const changes: ActualizarReservaRequestDto = reserva
    ? {
        ...(base.mesaId !== reserva.mesaId ? { mesaId: base.mesaId } : {}),
        ...(base.fecha !== reserva.fecha ? { fecha: base.fecha } : {}),
        ...(base.horaInicio !== reserva.horaInicio ? { horaInicio: base.horaInicio } : {}),
        ...(base.duracion !== getDuracionReserva(reserva) ? { duracion: base.duracion } : {}),
        ...(base.cantidadPersonas !== reserva.cantidadPersonas
          ? { cantidadPersonas: base.cantidadPersonas }
          : {}),
      }
    : base;
  const unchanged = Boolean(reserva && Object.keys(changes).length === 0);
  const mesa = mesas.find((item) => item.mesaId === values.mesaId && item.activo);
  function error(field: string) {
    return errors[field] ? (
      <p id={`${id}-${field}-error`} role="alert" className="text-xs text-red-700">
        {errors[field]}
      </p>
    ) : null;
  }
  return (
    <Modal
      title={reserva ? 'Reprogramar reserva' : 'Crear reserva'}
      description="Selecciona una mesa y un horario futuro. La disponibilidad se confirma al guardar."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        className="mt-4 space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (mutation.isPending || unchanged) return;
          mutation.clearError();
          const parsed = reserva
            ? actualizarReservaSchema.safeParse(changes)
            : crearReservaSchema.safeParse({
                ...base,
                cliente: { nombre: values.nombre, tel: values.tel },
              });
          const next: Record<string, string> = {};
          if (!parsed.success)
            parsed.error.issues.forEach((issue) => {
              const field = String(issue.path[issue.path.length - 1] ?? 'form');
              next[field] ??= issue.message;
            });
          if (!mesa) next.mesaId = 'Selecciona una mesa activa.';
          if (mesa && base.cantidadPersonas > mesa.capacidad)
            next.cantidadPersonas = `Esta mesa admite hasta ${mesa.capacidad} personas.`;
          if (!esInicioReservaFuturo(base.fecha, base.horaInicio))
            next.horaInicio = 'La reserva debe iniciar en una fecha y hora futuras.';
          setErrors(next);
          if (parsed.success && Object.keys(next).length === 0) mutation.mutate(parsed.data);
        }}
      >
        <fieldset disabled={mutation.isPending} className="space-y-4 disabled:opacity-60">
          <div>
            <label htmlFor={`${id}-mesaId`} className="block text-sm font-medium mb-1">
              Mesa *
            </label>
            <select
              id={`${id}-mesaId`}
              value={values.mesaId}
              required
              className={control}
              aria-invalid={Boolean(errors.mesaId)}
              aria-describedby={errors.mesaId ? `${id}-mesaId-error` : undefined}
              onChange={(event) => change('mesaId', event.target.value)}
            >
              <option value="">Selecciona una mesa</option>
              {mesas
                .filter((item) => item.activo)
                .map((item) => (
                  <option key={item.mesaId} value={item.mesaId}>
                    Mesa {item.numeroMesa} · {item.zona} · {item.capacidad} personas
                  </option>
                ))}
            </select>
            {error('mesaId')}
          </div>
          <DatePicker
            id={`${id}-fecha`}
            label="Fecha"
            value={values.fecha}
            required
            error={errors.fecha}
            onChange={(value) => change('fecha', value)}
          />
          <TimePicker
            id={`${id}-horaInicio`}
            label="Hora de inicio"
            value={values.horaInicio}
            required
            error={errors.horaInicio}
            onChange={(value) => change('horaInicio', value)}
          />
          {(
            [
              { field: 'duracion', label: 'Duración (minutos)', type: 'number', min: 15, max: 480 },
              {
                field: 'cantidadPersonas',
                label: 'Cantidad de personas',
                type: 'number',
                min: 1,
                max: mesa?.capacidad,
              },
              ...(!reserva
                ? [
                    {
                      field: 'nombre',
                      label: 'Nombre del contacto',
                      type: 'text',
                      max: undefined,
                      min: undefined,
                    },
                    {
                      field: 'tel',
                      label: 'Teléfono del contacto',
                      type: 'tel',
                      max: undefined,
                      min: undefined,
                    },
                  ]
                : []),
            ] as const
          ).map(({ field, label, type, min, max }) => (
            <div key={field}>
              <label htmlFor={`${id}-${field}`} className="block text-sm font-medium mb-1">
                {label} *
              </label>
              <input
                id={`${id}-${field}`}
                type={type}
                required
                min={min}
                max={max}
                step={type === 'number' ? 1 : undefined}
                maxLength={field === 'nombre' ? 100 : field === 'tel' ? 20 : undefined}
                value={values[field as keyof typeof values]}
                className={control}
                aria-invalid={Boolean(errors[field])}
                aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
                onChange={(event) => change(field as keyof typeof values, event.target.value)}
              />
              {error(field)}
            </div>
          ))}
          {reserva && (
            <p className="text-sm text-muted">
              Contacto: {reserva.nombreContacto} · {reserva.telefonoContacto}
            </p>
          )}
        </fieldset>
        {mutation.errorMessage && (
          <p role="alert" className="text-sm text-red-700">
            {mutation.errorMessage}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            className={`${boton} border border-border`}
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Volver a la agenda
          </button>
          <button
            type="submit"
            className={`${boton} bg-primary text-white hover:bg-primary-hover`}
            disabled={mutation.isPending || unchanged}
          >
            {mutation.isPending ? 'Guardando…' : reserva ? 'Guardar cambios' : 'Crear reserva'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
