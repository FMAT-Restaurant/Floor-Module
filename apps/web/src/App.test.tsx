import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './App';
import { EstadoMesa } from '@floor/shared';

describe('App Component', () => {
  it('renders the header and title correctly', () => {
    render(<App />);
    expect(screen.getByText('Floor Module')).toBeInTheDocument();
    expect(
      screen.getByText('Gestión de Sala, Mesas y Reservas en tiempo real'),
    ).toBeInTheDocument();
  });

  it('displays table state badges from shared contracts', () => {
    render(<App />);
    expect(screen.getByText(new RegExp(EstadoMesa.LIBRE))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(EstadoMesa.OCUPADA))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(EstadoMesa.LIMPIEZA_PENDIENTE))).toBeInTheDocument();
  });
});
