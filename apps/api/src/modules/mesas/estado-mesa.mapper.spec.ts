import { EstadoMesa as EstadoMesaPrisma } from '@prisma/client';
import { EstadoMesa } from '@floor/shared';
import { estadoMesaAPrisma, estadoMesaDesdePrisma } from './estado-mesa.mapper';

describe('Mapper de EstadoMesa (Prisma ↔ @floor/shared)', () => {
  it('convierte Limpieza_pendiente al valor exacto de shared', () => {
    expect(estadoMesaDesdePrisma(EstadoMesaPrisma.Limpieza_pendiente)).toBe('Limpieza pendiente');
  });

  it.each(Object.values(EstadoMesaPrisma))('es reversible para %s', (estado) => {
    expect(estadoMesaAPrisma(estadoMesaDesdePrisma(estado))).toBe(estado);
  });

  it.each(Object.values(EstadoMesa))('cubre todos los valores de shared: %s', (estado) => {
    expect(estadoMesaDesdePrisma(estadoMesaAPrisma(estado))).toBe(estado);
  });
});
