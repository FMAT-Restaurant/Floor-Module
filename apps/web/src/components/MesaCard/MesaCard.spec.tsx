import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EstadoMesa, type MesaEnVivoDto } from '@floor/shared';
import { MesaCard } from './MesaCard';

const mockBaseMesa: MesaEnVivoDto = {
  mesaId: '11111111-1111-4111-8111-111111111111',
  numeroMesa: 4,
  capacidad: 4,
  zona: 'Terraza',
  estadoFisico: EstadoMesa.LIBRE,
  unionId: null,
  activo: true,
  tieneReservaProxima: false,
  ocupadaDesde: null,
  meseroId: null,
};

describe('MesaCard Component', () => {
  it('renders in Libre state with green dot and "Libre" text', () => {
    render(<MesaCard mesa={mockBaseMesa} />);

    expect(screen.getByText('Mesa 4')).toBeInTheDocument();
    expect(screen.getByText(/4 personas/i)).toBeInTheDocument();
    expect(screen.getByText('Terraza')).toBeInTheDocument();

    const libreBadge = screen.getByText('Libre');
    expect(libreBadge).toBeInTheDocument();
    expect(libreBadge.className).toContain('text-emerald-700');
    expect(libreBadge.firstElementChild?.className).toContain('bg-emerald-500');
  });

  it('renders with tieneReservaProxima = true showing blue "Reservada" badge without altering capacity and number', () => {
    const mesaConReserva: MesaEnVivoDto = {
      ...mockBaseMesa,
      tieneReservaProxima: true,
    };

    render(<MesaCard mesa={mesaConReserva} />);

    expect(screen.getByText('Mesa 4')).toBeInTheDocument();
    expect(screen.getByText(/4 personas/i)).toBeInTheDocument();

    const reservadaBadge = screen.getByText('Reservada');
    expect(reservadaBadge).toBeInTheDocument();
    expect(reservadaBadge.className).toContain('text-blue-800');
    expect(reservadaBadge.className).toContain('bg-blue-50');
    expect(reservadaBadge.firstElementChild?.className).toContain('bg-blue-500');
  });

  it('renders in Ocupada state showing amber dot and calculated elapsed time', () => {
    const now = new Date('2026-10-11T13:02:00.000Z');
    const ocupadaDesde = new Date('2026-10-11T12:30:00.000Z').toISOString(); // 32 minutes earlier

    const mesaOcupada: MesaEnVivoDto = {
      ...mockBaseMesa,
      estadoFisico: EstadoMesa.OCUPADA,
      ocupadaDesde,
    };

    render(<MesaCard mesa={mesaOcupada} now={now} />);

    const ocupadaBadge = screen.getByText('Ocupada');
    expect(ocupadaBadge).toBeInTheDocument();
    expect(ocupadaBadge.className).toContain('text-amber-800');
    expect(ocupadaBadge.firstElementChild?.className).toContain('bg-amber-500');

    expect(screen.getByText('32 min')).toBeInTheDocument();
  });

  it('renders in Limpieza pendiente state showing amber/yellow dot and "Limpieza" text', () => {
    const mesaLimpieza: MesaEnVivoDto = {
      ...mockBaseMesa,
      estadoFisico: EstadoMesa.LIMPIEZA_PENDIENTE,
    };

    render(<MesaCard mesa={mesaLimpieza} />);

    const limpiezaBadge = screen.getByText('Limpieza');
    expect(limpiezaBadge).toBeInTheDocument();
    expect(limpiezaBadge.className).toContain('text-amber-700');
    expect(limpiezaBadge.firstElementChild?.className).toContain('bg-amber-400');
  });

  it('renders table in union showing "Unión activa" badge', () => {
    const mesaEnUnion: MesaEnVivoDto = {
      ...mockBaseMesa,
      unionId: '22222222-2222-4222-8222-222222222222',
    };

    render(<MesaCard mesa={mesaEnUnion} />);

    const unionBadge = screen.getByText('Unión activa');
    expect(unionBadge).toBeInTheDocument();
    expect(unionBadge.className).toContain('bg-orange-50');
    expect(unionBadge.className).toContain('text-primary');
  });

  it('applies orange border and soft orange background styles when isSelected is true', () => {
    const { container, rerender } = render(<MesaCard mesa={mockBaseMesa} isSelected={false} />);
    const cardEl = container.firstElementChild as HTMLElement;
    expect(cardEl.className).toContain('bg-surface');
    expect(cardEl.className).toContain('border-border');

    rerender(<MesaCard mesa={mockBaseMesa} isSelected={true} />);
    expect(cardEl.className).toContain('bg-primary-soft');
    expect(cardEl.className).toContain('border-primary');
  });

  it('invokes onSelect callback when clicking the card', () => {
    const handleSelect = vi.fn();
    render(<MesaCard mesa={mockBaseMesa} onSelect={handleSelect} />);

    const card = screen.getByRole('button', { name: 'Mesa 4' });
    fireEvent.click(card);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(mockBaseMesa);
  });

  it('invokes onAccion without triggering onSelect when clicking "Ver mesa"', () => {
    const handleSelect = vi.fn();
    const handleAccion = vi.fn();
    render(<MesaCard mesa={mockBaseMesa} onSelect={handleSelect} onAccion={handleAccion} />);

    const btn = screen.getByRole('button', { name: /ver mesa/i });
    fireEvent.click(btn);

    expect(handleAccion).toHaveBeenCalledTimes(1);
    expect(handleAccion).toHaveBeenCalledWith(mockBaseMesa);
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('supports keyboard selection via Enter and Space keys', () => {
    const handleSelect = vi.fn();
    render(<MesaCard mesa={mockBaseMesa} onSelect={handleSelect} />);

    const card = screen.getByRole('button', { name: 'Mesa 4' });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(handleSelect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(card, { key: ' ' });
    expect(handleSelect).toHaveBeenCalledTimes(2);
  });

  describe('formatTiempoOcupada helper', () => {
    it('handles null, undefined and invalid dates gracefully', async () => {
      const { formatTiempoOcupada } = await import('./utils');
      expect(formatTiempoOcupada(null)).toBeNull();
      expect(formatTiempoOcupada(undefined)).toBeNull();
      expect(formatTiempoOcupada('invalid-date')).toBeNull();
    });

    it('formats hours and minutes accurately', async () => {
      const { formatTiempoOcupada } = await import('./utils');
      const base = new Date('2026-10-11T12:00:00.000Z');
      expect(formatTiempoOcupada('2026-10-11T12:00:00.000Z', base)).toBe('0 min');
      expect(formatTiempoOcupada('2026-10-11T11:28:00.000Z', base)).toBe('32 min');
      expect(formatTiempoOcupada('2026-10-11T10:45:00.000Z', base)).toBe('1h 15m');
      expect(formatTiempoOcupada('2026-10-11T10:00:00.000Z', base)).toBe('2h');
    });
  });
});
