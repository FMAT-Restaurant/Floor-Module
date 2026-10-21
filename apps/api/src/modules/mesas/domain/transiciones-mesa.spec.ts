import { EstadoMesa } from '@floor/shared';
import { esTransicionManualPermitida, transicionesManualesDesde } from './transiciones-mesa';

const { LIBRE, OCUPADA, LIMPIEZA_PENDIENTE } = EstadoMesa;

describe('Máquina de estados de mesa · transiciones manuales (SPEC §4.1)', () => {
  describe('transiciones permitidas', () => {
    it('RN-06: Ocupada → Limpieza pendiente', () => {
      expect(esTransicionManualPermitida(OCUPADA, LIMPIEZA_PENDIENTE)).toBe(true);
    });

    it('RN-07: Limpieza pendiente → Libre', () => {
      expect(esTransicionManualPermitida(LIMPIEZA_PENDIENTE, LIBRE)).toBe(true);
    });
  });

  describe('transiciones rechazadas (RN-07: cualquier otra es 409 TRANSICION_INVALIDA)', () => {
    it.each([
      [LIBRE, LIMPIEZA_PENDIENTE, 'saltar la ocupación'],
      [LIBRE, OCUPADA, 'RN-04: ocupar sólo por POST /ocupar o unión'],
      [OCUPADA, LIBRE, 'saltar la limpieza'],
      [OCUPADA, OCUPADA, 'mismo estado'],
      [LIBRE, LIBRE, 'mismo estado'],
      [LIMPIEZA_PENDIENTE, LIMPIEZA_PENDIENTE, 'mismo estado'],
      [LIMPIEZA_PENDIENTE, OCUPADA, 'RN-04: ocupar sólo por POST /ocupar o unión'],
    ])('%s → %s no está permitida (%s)', (desde, hacia) => {
      expect(esTransicionManualPermitida(desde, hacia)).toBe(false);
    });
  });

  it('cubre las 9 combinaciones: sólo 2 están permitidas', () => {
    const estados = Object.values(EstadoMesa);
    const combinaciones = estados.flatMap((desde) =>
      estados.map((hacia) => [desde, hacia] as const),
    );

    const permitidas = combinaciones.filter(([desde, hacia]) =>
      esTransicionManualPermitida(desde, hacia),
    );

    expect(combinaciones).toHaveLength(9);
    expect(permitidas).toEqual([
      [OCUPADA, LIMPIEZA_PENDIENTE],
      [LIMPIEZA_PENDIENTE, LIBRE],
    ]);
  });

  describe('transicionesManualesDesde', () => {
    it.each([
      [LIBRE, []],
      [OCUPADA, [LIMPIEZA_PENDIENTE]],
      [LIMPIEZA_PENDIENTE, [LIBRE]],
    ])('desde %s sólo se puede ir a %j', (desde, esperado) => {
      expect(transicionesManualesDesde(desde)).toEqual(esperado);
    });
  });
});
