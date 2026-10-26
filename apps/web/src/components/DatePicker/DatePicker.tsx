import React, { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Calendar } from '../Calendar';

export interface DatePickerProps {
  readonly id: string;
  readonly name?: string;
  readonly label: string;
  readonly value: string; // YYYY-MM-DD
  readonly onChange: (fecha: string) => void;
  readonly required?: boolean;
  readonly error?: string;
  readonly 'aria-invalid'?: boolean;
  readonly className?: string;
  readonly inputClassName?: string;
}

export function DatePicker({
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
}: DatePickerProps): React.JSX.Element {
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
        event.preventDefault();
        event.stopImmediatePropagation();
        setIsOpen(false);
        containerRef.current?.querySelector('input')?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-1 relative', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <div className="relative flex items-center">
        <input
          id={id}
          name={name}
          type="date"
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
          aria-label="Abrir calendario"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary hover:text-primary-hover p-0.5 rounded transition-colors focus:outline-none"
        >
          <CalendarIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}

      {isOpen && (
        <div
          data-testid={`datepicker-popover-${id}`}
          className="absolute top-full mt-1.5 z-40 shadow-lg animate-fadeIn left-0"
        >
          <Calendar
            value={value}
            onChange={(nuevaFecha) => {
              onChange(nuevaFecha);
              setIsOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
