import React, { useEffect, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import {
  fixtureMeserosCatalogo,
  type MesaEnVivoDto,
  type MeseroCatalogoItem,
  type OcuparMesaResponseDto,
} from '@floor/shared';
import { cn } from '../../lib/utils';

export interface OcuparMesaModalProps {
  readonly mesa: MesaEnVivoDto | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: (response: OcuparMesaResponseDto) => void;
  readonly meserosCatalogo?: readonly MeseroCatalogoItem[];
}

export function OcuparMesaModal({
  mesa,
  isOpen,
  onClose,
  meserosCatalogo = fixtureMeserosCatalogo,
}: OcuparMesaModalProps): React.JSX.Element | null {
  const [comensales, setComensales] = useState<number | ''>(1);
  const [meseroId, setMeseroId] = useState<string>('');
  const [reservaId, setReservaId] = useState<string>('');
  const [esperaId, setEsperaId] = useState<string>('');
  const [mostrarOpcionesAvanzadas, setMostrarOpcionesAvanzadas] = useState(false);

  useEffect(() => {
    if (isOpen && mesa) {
      setComensales(1);
      setMeseroId(mesa.meseroId ?? '');
      setReservaId('');
      setEsperaId('');
      setMostrarOpcionesAvanzadas(false);
    }
  }, [isOpen, mesa]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mesa) {
    return null;
  }

  const comensalesNum = typeof comensales === 'number' ? comensales : parseInt(comensales, 10);
  const comensalesValido = Number.isInteger(comensalesNum) && comensalesNum >= 1;
  const meseroValido = Boolean(meseroId && meseroId.trim().length > 0);
  const isFormValid = comensalesValido && meseroValido;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
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
          className="absolute top-4 right-4 text-muted hover:text-ink p-1 rounded-control transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              onChange={(e) => {
                const val = e.target.value;
                setComensales(val === '' ? '' : parseInt(val, 10));
              }}
              className={cn(
                'h-10 px-3 rounded-control border border-border focus:ring-2 focus:ring-primary w-full outline-none transition-colors text-ink text-sm',
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

          {/* Mesero responsable */}
          <div>
            <label htmlFor="meseroId" className="block text-sm font-medium text-text mb-1">
              Mesero responsable <span className="text-red-500">*</span>
            </label>
            <select
              id="meseroId"
              name="meseroId"
              value={meseroId}
              onChange={(e) => setMeseroId(e.target.value)}
              className="h-10 px-3 rounded-control border border-border focus:ring-2 focus:ring-primary w-full bg-white outline-none transition-colors text-ink text-sm"
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
              onClick={() => setMostrarOpcionesAvanzadas(!mostrarOpcionesAvanzadas)}
              className="text-xs text-muted hover:text-ink font-medium inline-flex items-center gap-1 transition-colors"
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
                <div>
                  <label htmlFor="reservaId" className="block text-xs font-medium text-text mb-1">
                    ID de Reserva (opcional)
                  </label>
                  <input
                    id="reservaId"
                    name="reservaId"
                    type="text"
                    value={reservaId}
                    onChange={(e) => setReservaId(e.target.value)}
                    placeholder="UUID de reserva asociada"
                    className="h-9 px-2.5 text-xs rounded-control border border-border focus:ring-2 focus:ring-primary w-full bg-white outline-none text-ink"
                  />
                </div>
                <div>
                  <label htmlFor="esperaId" className="block text-xs font-medium text-text mb-1">
                    ID de Lista de Espera (opcional)
                  </label>
                  <input
                    id="esperaId"
                    name="esperaId"
                    type="text"
                    value={esperaId}
                    onChange={(e) => setEsperaId(e.target.value)}
                    placeholder="UUID del turno en lista de espera"
                    className="h-9 px-2.5 text-xs rounded-control border border-border focus:ring-2 focus:ring-primary w-full bg-white outline-none text-ink"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Botonera inferior */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 bg-white border border-border text-text rounded-control hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid}
              className="h-10 px-4 bg-primary hover:bg-primary-hover text-white rounded-control font-medium inline-flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
            >
              Confirmar Ocupación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
