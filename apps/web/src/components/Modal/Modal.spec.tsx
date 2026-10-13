import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from './Modal';

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const defaultProps = {
    title: 'Título de prueba',
    description: 'Descripción de prueba',
    pending: false,
    onClose: vi.fn(),
    children: <button type="button">Acción</button>,
  };

  return render(<Modal {...defaultProps} {...props} />);
}

describe('Modal Component', () => {
  it('renderiza portal con título, descripción e hijos asociados por aria', () => {
    renderModal({ children: <p>Contenido</p> });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', expect.stringMatching(/-title$/));
    expect(dialog).toHaveAttribute('aria-describedby', expect.stringMatching(/-description$/));
    expect(screen.getByText('Título de prueba')).toBeInTheDocument();
    expect(screen.getByText('Descripción de prueba')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('cierra con Escape, botón X y clic en el fondo (pero no clic en el diálogo)', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /cerrar modal/i }));
    expect(onClose).toHaveBeenCalledTimes(2);

    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByText('Acción'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('bloquea el cierre mientras hay una operación pendiente', () => {
    const onClose = vi.fn();
    renderModal({ onClose, pending: true });

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).not.toHaveBeenCalled();

    const closeButton = screen.getByRole('button', { name: /cerrar modal/i });
    expect(closeButton).toBeDisabled();
    fireEvent.click(closeButton);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  });

  it('mantiene el foco dentro del diálogo y lo devuelve al cerrar', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Origen';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = renderModal();

    expect(screen.getByRole('dialog')).toHaveFocus();

    const accion = screen.getByRole('button', { name: /acción/i });
    accion.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(screen.getByRole('button', { name: /cerrar modal/i })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(accion).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
  });
});
