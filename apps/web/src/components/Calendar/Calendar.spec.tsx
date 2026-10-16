import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Calendar } from './Calendar';

describe('Calendar Component', () => {
  it('renderiza el mes y año actual y permite navegar entre meses', () => {
    render(<Calendar value="2026-10-15" />);

    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();

    const btnAnterior = screen.getByRole('button', { name: 'Mes anterior' });
    fireEvent.click(btnAnterior);
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument();

    const btnSiguiente = screen.getByRole('button', { name: 'Mes siguiente' });
    fireEvent.click(btnSiguiente);
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
  });

  it('aplica menor visibilidad (gris más tenue y mayor transparencia) a las fechas fuera del mes seleccionado', () => {
    // En Octubre 2026:
    // El 1 de Octubre de 2026 cae en Jueves.
    // Lunes 28, Martes 29 y Miércoles 30 de Septiembre son días fuera del mes actual.
    render(<Calendar value="2026-10-15" />);

    const grid = screen.getByRole('grid');
    const celdas = within(grid).getAllByRole('gridcell');

    // Días del mes anterior (Septiembre 28, 29, 30)
    const celdaFuera = celdas.find((c) =>
      c.getAttribute('aria-label')?.includes('(fuera del mes)'),
    );
    expect(celdaFuera).toBeDefined();
    expect(celdaFuera?.className).toContain('text-gray-400');
    expect(celdaFuera?.className).toContain('opacity-40');

    // Días del mes actual (ej. 15 de Octubre)
    const celdaDentro = celdas.find((c) =>
      c.getAttribute('aria-label')?.startsWith('15 de Octubre'),
    );
    expect(celdaDentro).toBeDefined();
    expect(celdaDentro?.className).not.toContain('opacity-40');
  });

  it('llama a onChange cuando se selecciona una fecha', () => {
    const handleChange = vi.fn();
    render(<Calendar value="2026-10-15" onChange={handleChange} />);

    const grid = screen.getByRole('grid');
    const celdas = within(grid).getAllByRole('gridcell');

    const dia20 = celdas.find((c) => c.getAttribute('aria-label')?.startsWith('20 de Octubre'));
    expect(dia20).toBeDefined();
    fireEvent.click(dia20!);

    expect(handleChange).toHaveBeenCalledWith('2026-10-20');
  });

  it('selecciona y cambia de mes al hacer clic en una fecha fuera del mes', () => {
    const handleChange = vi.fn();
    render(<Calendar value="2026-10-15" onChange={handleChange} />);

    const grid = screen.getByRole('grid');
    const celdas = within(grid).getAllByRole('gridcell');

    // Día 1 de Noviembre (fuera del mes de Octubre)
    const diaNoviembre = celdas.find(
      (c) =>
        c.getAttribute('aria-label')?.includes('1 de Noviembre') &&
        c.getAttribute('aria-label')?.includes('(fuera del mes)'),
    );
    expect(diaNoviembre).toBeDefined();
    fireEvent.click(diaNoviembre!);

    expect(handleChange).toHaveBeenCalledWith('2026-11-01');
    expect(screen.getByText('Noviembre 2026')).toBeInTheDocument();
  });
});
