import { describe, it, expect } from 'vitest';
import { fixtureMesasEnVivo } from '@floor/shared';
import { calcularAforoTotal, esMesaUnible, formatListaMesas } from './uniones';

const porNumero = (numero: number) => {
  const mesa = fixtureMesasEnVivo.find((m) => m.numeroMesa === numero);
  if (!mesa) throw new Error(`Fixture de mesa ${numero} no encontrada`);
  return mesa;
};

describe('lib/uniones · RN-12', () => {
  it('acepta mesas libres sin unión cuando no hay selección previa', () => {
    expect(esMesaUnible(porNumero(1), [])).toBe(true);
  });

  it('rechaza mesas ocupadas, en limpieza o ya unidas', () => {
    expect(esMesaUnible(porNumero(3), [])).toBe(false);
    expect(esMesaUnible(porNumero(4), [])).toBe(false);
    expect(esMesaUnible(porNumero(5), [])).toBe(false);
  });

  it('rechaza mesas de una zona distinta a la ya seleccionada', () => {
    expect(esMesaUnible(porNumero(7), [porNumero(1)])).toBe(false);
    expect(esMesaUnible(porNumero(2), [porNumero(1)])).toBe(true);
  });

  it('suma el aforo y formatea la lista de mesas', () => {
    expect(calcularAforoTotal([porNumero(1), porNumero(2)])).toBe(6);
    expect(formatListaMesas([2, 1])).toBe('1 y 2');
    expect(formatListaMesas([3, 1, 2])).toBe('1, 2 y 3');
    expect(formatListaMesas([4])).toBe('4');
  });
});
