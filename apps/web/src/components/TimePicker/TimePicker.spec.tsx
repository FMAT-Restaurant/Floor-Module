import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimePicker } from './TimePicker';

describe('TimePicker', () => {
  it('renderiza label, input de tiempo y valor inicial', () => {
    render(<TimePicker id="test-time" label="Hora de inicio" value="19:30" onChange={vi.fn()} />);

    const input = screen.getByLabelText(/Hora de inicio/);
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('19:30');
  });

  it('abre el popover al hacer clic en el botón de icono de reloj', () => {
    render(<TimePicker id="test-time" label="Hora de inicio" value="19:30" onChange={vi.fn()} />);

    expect(screen.queryByTestId('timepicker-popover-test-time')).not.toBeInTheDocument();

    const openBtn = screen.getByRole('button', { name: 'Abrir selector de hora' });
    fireEvent.click(openBtn);

    expect(screen.getByTestId('timepicker-popover-test-time')).toBeInTheDocument();
    expect(screen.getByText('Turnos frecuentes')).toBeInTheDocument();
  });

  it('selecciona un preset frecuente, llama a onChange y cierra el popover', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker id="test-time" label="Hora de inicio" value="19:00" onChange={handleChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir selector de hora' }));
    const presetBtn = screen.getByRole('button', { name: '20:30' });
    fireEvent.click(presetBtn);

    expect(handleChange).toHaveBeenCalledWith('20:30');
    expect(screen.queryByTestId('timepicker-popover-test-time')).not.toBeInTheDocument();
  });

  it('permite seleccionar hora y minuto individualmente en las columnas', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker id="test-time" label="Hora de inicio" value="19:00" onChange={handleChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir selector de hora' }));

    // Seleccionar hora 21
    fireEvent.click(screen.getByRole('button', { name: 'Hora 21' }));
    expect(handleChange).toHaveBeenCalledWith('21:00');

    // Seleccionar minuto 45
    fireEvent.click(screen.getByRole('button', { name: 'Minuto 45' }));
    expect(handleChange).toHaveBeenCalledWith('19:45');
  });

  it('cierra el popover al hacer clic en el botón Listo o con tecla Escape', () => {
    render(<TimePicker id="test-time" label="Hora de inicio" value="19:00" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir selector de hora' }));
    expect(screen.getByTestId('timepicker-popover-test-time')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByTestId('timepicker-popover-test-time')).not.toBeInTheDocument();

    // Reabrir y presionar Escape
    fireEvent.click(screen.getByRole('button', { name: 'Abrir selector de hora' }));
    expect(screen.getByTestId('timepicker-popover-test-time')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('timepicker-popover-test-time')).not.toBeInTheDocument();
  });

  it('muestra mensaje de error cuando la validación falla', () => {
    render(
      <TimePicker
        id="test-time"
        label="Hora de inicio"
        value=""
        error="La hora de inicio es requerida"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('La hora de inicio es requerida');
    expect(screen.getByLabelText(/Hora de inicio/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('permite usar el botón Ahora para redondear a los 15 minutos más cercanos', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker id="test-time" label="Hora de inicio" value="12:00" onChange={handleChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir selector de hora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ahora' }));

    expect(handleChange).toHaveBeenCalled();
    expect(screen.queryByTestId('timepicker-popover-test-time')).not.toBeInTheDocument();
  });
});
