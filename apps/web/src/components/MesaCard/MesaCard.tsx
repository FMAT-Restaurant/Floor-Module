import React from 'react';
import { Users, Clock } from 'lucide-react';
import { EstadoMesa, type MesaEnVivoDto } from '@floor/shared';
import { cn } from '../../lib/utils';
import { formatTiempoOcupada } from './utils';

export interface MesaCardProps {
  readonly mesa: MesaEnVivoDto;
  readonly isSelected?: boolean;
  readonly onSelect?: (mesa: MesaEnVivoDto) => void;
  readonly onAccion?: (mesa: MesaEnVivoDto) => void;
  readonly now?: Date;
}

interface EstadoVisualInfo {
  readonly badgeClass: string;
  readonly dotClass: string;
  readonly texto: string;
}

function getEstadoVisual(mesa: MesaEnVivoDto): EstadoVisualInfo {
  if (mesa.estadoFisico === EstadoMesa.LIBRE) {
    if (mesa.tieneReservaProxima) {
      return {
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
        dotClass: 'bg-blue-500',
        texto: 'Reservada',
      };
    }
    return {
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotClass: 'bg-emerald-500',
      texto: 'Libre',
    };
  }
  if (mesa.estadoFisico === EstadoMesa.OCUPADA) {
    return {
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      dotClass: 'bg-amber-500',
      texto: 'Ocupada',
    };
  }
  return {
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-400',
    texto: 'Limpieza',
  };
}

export function MesaCard({
  mesa,
  isSelected = false,
  onSelect,
  onAccion,
  now,
}: MesaCardProps): React.JSX.Element {
  const isOcupada = mesa.estadoFisico === EstadoMesa.OCUPADA;
  const tiempoOcupada = isOcupada ? formatTiempoOcupada(mesa.ocupadaDesde, now) : null;
  const estadoVisual = getEstadoVisual(mesa);

  const handleCardClick = () => {
    onSelect?.(mesa);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(mesa);
    }
  };

  const handleAccionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onAccion?.(mesa);
  };

  return (
    <div
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Mesa ${mesa.numeroMesa}`}
      data-testid={`mesa-card-${mesa.numeroMesa}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'p-4 rounded-card border transition-all cursor-pointer flex flex-col justify-between gap-4 select-none',
        isSelected
          ? 'bg-primary-soft border-primary shadow-subtle'
          : 'bg-surface border-border hover:border-gray-300 shadow-subtle',
      )}
    >
      <div className="space-y-3">
        {/* Cabecera de estado: Dot semántico + texto + tags */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full border',
                estadoVisual.badgeClass,
              )}
            >
              <span
                className={cn('w-1.5 h-1.5 rounded-full', estadoVisual.dotClass)}
                aria-hidden="true"
              />
              {estadoVisual.texto}
            </span>

            {mesa.unionId && (
              <span className="bg-orange-50 text-primary border border-orange-200 text-xs font-medium px-2 py-0.5 rounded-full">
                Unión activa
              </span>
            )}
          </div>

          {tiempoOcupada && (
            <span
              className="text-xs text-muted flex items-center gap-1 font-medium ml-auto"
              data-testid="tiempo-ocupada"
            >
              <Clock className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
              <span>{tiempoOcupada}</span>
            </span>
          )}
        </div>

        {/* Identificador y capacidad */}
        <div>
          <h3 className="text-lg font-bold text-ink">Mesa {mesa.numeroMesa}</h3>
          <div className="flex items-center gap-2 text-sm text-muted mt-1">
            <span className="inline-flex items-center gap-1">
              <Users className="w-4 h-4 text-muted" aria-hidden="true" />
              <span>{mesa.capacidad} personas</span>
            </span>
            <span>·</span>
            <span>{mesa.zona}</span>
          </div>
        </div>
      </div>

      {/* Acción secundaria de 40px en la base */}
      <div className="pt-2 border-t border-border/60">
        <button
          type="button"
          onClick={handleAccionClick}
          className="h-control w-full px-4 bg-surface border border-primary/40 hover:border-primary text-primary hover:bg-primary-soft text-sm font-medium rounded-control transition-colors inline-flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          Ver mesa
        </button>
      </div>
    </div>
  );
}
