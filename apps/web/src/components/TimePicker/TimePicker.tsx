import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TimePickerProps {
  readonly id: string;
  readonly name?: string;
  readonly label: string;
  readonly value: string; // HH:mm
  readonly onChange: (hora: string) => void;
  readonly required?: boolean;
  readonly error?: string;
  readonly 'aria-invalid'?: boolean;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly stepMinutes?: number;
  readonly presets?: string[];
}

const DEFAULT_PRESETS = [
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
];

export function TimePicker({
  id,
  name,
  label,
  value,
  onChange,
  required,
  error,
  'aria-invalid': ariaInvalid,
  className,
  inputClassName,
  stepMinutes = 15,
  presets = DEFAULT_PRESETS,
}: TimePickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const [selectedHour, selectedMinute] = useMemo(() => {
    if (value && /^\d{1,2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(':');
      return [h.padStart(2, '0'), m.padStart(2, '0')];
    }
    return ['19', '00'];
  }, [value]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), []);

  const minutes = useMemo(() => {
    const list: string[] = [];
    const step = Math.max(1, Math.min(stepMinutes, 60));
    for (let i = 0; i < 60; i += step) {
      list.push(String(i).padStart(2, '0'));
    }
    return list;
  }, [stepMinutes]);

  const handleSelectHour = (h: string) => {
    onChange(`${h}:${selectedMinute}`);
  };

  const handleSelectMinute = (m: string) => {
    onChange(`${selectedHour}:${m}`);
  };

  const handleSetCurrentTime = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const roundedMin = Math.floor(now.getMinutes() / stepMinutes) * stepMinutes;
    const m = String(roundedMin % 60).padStart(2, '0');
    onChange(`${h}:${m}`);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-1 relative', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <div className="relative flex items-center">
        <input
          id={id}
          name={name}
          type="time"
          value={value}
          aria-invalid={ariaInvalid || Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
          onClick={() => setIsOpen(true)}
          className={cn(
            'h-control pl-3 pr-9 w-full bg-surface border border-border rounded-control text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer transition-colors',
            '[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            inputClassName,
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Abrir selector de hora"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary hover:text-primary-hover p-0.5 rounded transition-colors focus:outline-none"
        >
          <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}

      {isOpen && (
        <div
          data-testid={`timepicker-popover-${id}`}
          className="absolute top-full mt-1.5 z-40 shadow-lg animate-fadeIn left-0 w-72 bg-surface border border-border rounded-card p-3 select-none"
        >
          {/* Horarios frecuentes */}
          {presets.length > 0 && (
            <div className="mb-3">
              <span className="block text-xs font-semibold text-muted mb-1.5">
                Turnos frecuentes
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onChange(preset);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'px-2 py-0.5 text-xs rounded-control border transition-colors',
                      value === preset
                        ? 'bg-primary text-white border-primary font-medium'
                        : 'bg-canvas/60 border-border text-ink hover:bg-canvas hover:border-primary/50',
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selector de Horas y Minutos */}
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-2.5">
            {/* Columna Horas */}
            <div>
              <span className="block text-xs font-semibold text-muted text-center mb-1">Hora</span>
              <div
                className="max-h-36 overflow-y-auto space-y-0.5 pr-1"
                data-testid="timepicker-hours-list"
              >
                {hours.map((h) => {
                  const isSelected = selectedHour === h;
                  const isOffHours = Number(h) < 12; // Fuera de horario estándar de restaurante
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Hora ${h}`}
                      onClick={() => handleSelectHour(h)}
                      className={cn(
                        'w-full h-7 text-xs rounded-control flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                        isSelected
                          ? 'bg-primary text-white font-semibold shadow-sm'
                          : isOffHours
                            ? 'text-gray-400 opacity-50 hover:opacity-100 hover:text-ink hover:bg-canvas'
                            : 'text-ink font-medium hover:bg-canvas',
                      )}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Columna Minutos */}
            <div>
              <span className="block text-xs font-semibold text-muted text-center mb-1">
                Minutos
              </span>
              <div
                className="max-h-36 overflow-y-auto space-y-0.5 pr-1"
                data-testid="timepicker-minutes-list"
              >
                {minutes.map((m) => {
                  const isSelected = selectedMinute === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-label={`Minuto ${m}`}
                      onClick={() => handleSelectMinute(m)}
                      className={cn(
                        'w-full h-7 text-xs rounded-control flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                        isSelected
                          ? 'bg-primary text-white font-semibold shadow-sm'
                          : 'text-ink font-medium hover:bg-canvas',
                      )}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pie de acciones */}
          <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleSetCurrentTime}
              className="text-primary hover:text-primary-hover font-medium underline-offset-2 hover:underline"
            >
              Ahora
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">
                {selectedHour}:{selectedMinute}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 bg-primary text-white font-medium rounded-control text-xs hover:bg-primary-hover transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
