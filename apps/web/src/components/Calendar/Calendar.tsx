import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getFechaLocalHoy } from '../../lib/reservas';

export interface CalendarProps {
  readonly value?: string; // YYYY-MM-DD
  readonly onChange?: (fecha: string) => void;
  readonly className?: string;
  readonly minDate?: string;
  readonly maxDate?: string;
}

interface CalendarDay {
  readonly date: Date;
  readonly dateString: string;
  readonly dayNumber: number;
  readonly isCurrentMonth: boolean;
  readonly isSelected: boolean;
  readonly isToday: boolean;
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'] as const;

function formatearFechaISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function Calendar({ value, onChange, className }: CalendarProps): React.JSX.Element {
  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [value]);

  const [currentYear, setCurrentYear] = useState<number>(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(initialDate.getMonth());

  const hoyStr = useMemo(() => getFechaLocalHoy(), []);

  const daysGrid = useMemo<CalendarDay[]>(() => {
    const days: CalendarDay[] = [];

    // Primer día del mes
    const firstDay = new Date(currentYear, currentMonth, 1);
    // Día de la semana (0 = Domingo, 1 = Lunes, ..., 6 = Sábado)
    const dayOfWeek = firstDay.getDay();
    // Ajustar a Lunes = 0, ..., Domingo = 6
    const startOffset = (dayOfWeek + 6) % 7;

    // Días del mes anterior para completar la primera semana
    const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const prevDate = new Date(currentYear, currentMonth - 1, prevMonthLastDate - i);
      const str = formatearFechaISO(prevDate);
      days.push({
        date: prevDate,
        dateString: str,
        dayNumber: prevMonthLastDate - i,
        isCurrentMonth: false,
        isSelected: value === str,
        isToday: hoyStr === str,
      });
    }

    // Días del mes actual
    const currentMonthLastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= currentMonthLastDate; i++) {
      const currDate = new Date(currentYear, currentMonth, i);
      const str = formatearFechaISO(currDate);
      days.push({
        date: currDate,
        dateString: str,
        dayNumber: i,
        isCurrentMonth: true,
        isSelected: value === str,
        isToday: hoyStr === str,
      });
    }

    // Días del mes siguiente para completar la cuadrícula (múltiplo de 7)
    const totalCells = Math.ceil(days.length / 7) * 7;
    const nextDaysCount = totalCells - days.length;
    for (let i = 1; i <= nextDaysCount; i++) {
      const nextDate = new Date(currentYear, currentMonth + 1, i);
      const str = formatearFechaISO(nextDate);
      days.push({
        date: nextDate,
        dateString: str,
        dayNumber: i,
        isCurrentMonth: false,
        isSelected: value === str,
        isToday: hoyStr === str,
      });
    }

    return days;
  }, [currentYear, currentMonth, value, hoyStr]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: CalendarDay) => {
    if (!day.isCurrentMonth) {
      setCurrentYear(day.date.getFullYear());
      setCurrentMonth(day.date.getMonth());
    }
    onChange?.(day.dateString);
  };

  return (
    <div
      role="region"
      aria-label="Calendario de fechas"
      data-testid="componente-calendario"
      className={cn(
        'w-72 bg-surface border border-border rounded-card p-3 shadow-sm select-none',
        className,
      )}
    >
      {/* Encabezado del mes con navegación */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-ink">
          {MESES[currentMonth]} {currentYear}
        </h4>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={handlePrevMonth}
            className="w-7 h-7 flex items-center justify-center rounded-control hover:bg-canvas text-muted hover:text-ink transition-colors focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={handleNextMonth}
            className="w-7 h-7 flex items-center justify-center rounded-control hover:bg-canvas text-muted hover:text-ink transition-colors focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {DIAS_SEMANA.map((dia) => (
          <span key={dia} className="text-[11px] font-semibold text-muted py-1" aria-hidden="true">
            {dia}
          </span>
        ))}
      </div>

      {/* Cuadrícula de días */}
      <div className="grid grid-cols-7 gap-1" role="grid">
        {daysGrid.map((day) => {
          return (
            <button
              key={day.dateString}
              type="button"
              role="gridcell"
              aria-label={`${day.dayNumber} de ${MESES[day.date.getMonth()]} de ${day.date.getFullYear()}${
                !day.isCurrentMonth ? ' (fuera del mes)' : ''
              }`}
              aria-selected={day.isSelected}
              onClick={() => handleSelectDay(day)}
              className={cn(
                'h-8 w-8 text-xs rounded-control flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                // Fechas del mes actual vs Fechas fuera del mes seleccionado:
                // Las fechas fuera del mes se muestran con gris más tenue y mayor transparencia
                day.isCurrentMonth
                  ? 'text-ink font-medium hover:bg-canvas'
                  : 'text-gray-400 opacity-40 hover:opacity-75 hover:bg-canvas/60',
                // Fecha de hoy (si no está seleccionada)
                day.isToday && !day.isSelected && 'border border-primary/50 font-bold',
                // Fecha seleccionada
                day.isSelected &&
                  'bg-primary text-white font-semibold shadow-sm hover:bg-primary-hover hover:text-white opacity-100',
              )}
            >
              {day.dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
