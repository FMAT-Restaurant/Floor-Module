import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './DatePicker';

describe('DatePicker Component', () => {
  it('renderiza la etiqueta y el input de tipo date', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Fecha de reserva"
        value="2026-10-15"
        onChange={handleChange}
        required
      />,
    );

    const input = screen.getByLabelText(/Fecha de reserva/);
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('2026-10-15');
  });

  it('despliega el calendario personalizado al hacer clic en el botón del icono', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Fecha de reserva"
        value="2026-10-15"
        onChange={handleChange}
      />,
    );

    expect(screen.queryByTestId('componente-calendario')).not.toBeInTheDocument();

    const btnIcon = screen.getByRole('button', {
      name: 'Abrir calendario',
    });
    fireEvent.click(btnIcon);

    expect(screen.getByTestId('componente-calendario')).toBeInTheDocument();
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
  });

  it('despliega el calendario al hacer clic en el input de fecha', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Fecha de agenda"
        value="2026-10-15"
        onChange={handleChange}
      />,
    );

    const input = screen.getByLabelText('Fecha de agenda');
    fireEvent.click(input);

    expect(screen.getByTestId('componente-calendario')).toBeInTheDocument();
  });

  it('selecciona una fecha desde el calendario emergente, llama a onChange y se cierra', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Fecha de agenda"
        value="2026-10-15"
        onChange={handleChange}
      />,
    );

    const btnIcon = screen.getByRole('button', {
      name: 'Abrir calendario',
    });
    fireEvent.click(btnIcon);

    const dia18 = screen.getByRole('gridcell', { name: /^18 de Octubre/ });
    fireEvent.click(dia18);

    expect(handleChange).toHaveBeenCalledWith('2026-10-18');
    expect(screen.queryByTestId('componente-calendario')).not.toBeInTheDocument();
  });

  it('cierra el calendario al presionar Escape o hacer clic fuera', () => {
    const handleChange = vi.fn();
    render(
      <div>
        <DatePicker
          id="test-date"
          label="Fecha de agenda"
          value="2026-10-15"
          onChange={handleChange}
        />
        <button type="button">Elemento externo</button>
      </div>,
    );

    const input = screen.getByLabelText('Fecha de agenda');
    fireEvent.click(input);
    expect(screen.getByTestId('componente-calendario')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('componente-calendario')).not.toBeInTheDocument();

    // Probar clic fuera
    fireEvent.click(input);
    expect(screen.getByTestId('componente-calendario')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('Elemento externo'));
    expect(screen.queryByTestId('componente-calendario')).not.toBeInTheDocument();
  });

  it('muestra mensaje de error cuando se le pasa la prop error', () => {
    render(
      <DatePicker
        id="test-date"
        label="Fecha con error"
        value="2026-10-15"
        onChange={vi.fn()}
        error="La fecha es obligatoria"
      />,
    );

    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toHaveTextContent('La fecha es obligatoria');
  });
});
