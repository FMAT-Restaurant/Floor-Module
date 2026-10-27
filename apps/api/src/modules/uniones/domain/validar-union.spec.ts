import { EstadoMesa } from '@floor/shared';
import type { DomainException } from '../../../common/errors/domain.exception';
import type { MesaCandidataRegistro } from '../union.registro';
import { validarMesasParaUnion, validarSeleccionUnion } from './validar-union';

const MESA_1 = 'a1000000-0000-4000-8000-000000000001';
const MESA_2 = 'a1000000-0000-4000-8000-000000000002';
const MESA_3 = 'a1000000-0000-4000-8000-000000000003';

function mesa(id: string, datos: Partial<MesaCandidataRegistro> = {}): MesaCandidataRegistro {
  return {
    id,
    numeroMesa: 1,
    capacidad: 4,
    zona: 'Terraza',
    estadoFisico: EstadoMesa.LIBRE,
    unionMesaId: null,
    activo: true,
    ...datos,
  };
}

function capturar(fn: () => unknown): { status: number; code: string; details: unknown } {
  try {
    fn();
  } catch (error) {
    const excepcion = error as DomainException;
    const cuerpo = excepcion.getResponse() as { code: string; details: unknown };
    return { status: excepcion.getStatus(), code: cuerpo.code, details: cuerpo.details };
  }
  throw new Error('Se esperaba una excepción');
}

describe('validarSeleccionUnion (SPEC §8)', () => {
  it('rechaza con 400 UNION_INVALIDA si hay menos de 2 mesas', () => {
    expect(capturar(() => validarSeleccionUnion([MESA_1]))).toMatchObject({
      status: 400,
      code: 'UNION_INVALIDA',
    });
  });

  it('rechaza con 400 UNION_INVALIDA si hay identificadores duplicados', () => {
    expect(capturar(() => validarSeleccionUnion([MESA_1, MESA_1]))).toMatchObject({
      status: 400,
      code: 'UNION_INVALIDA',
    });
  });

  it('acepta 2 o más mesas distintas', () => {
    expect(() => validarSeleccionUnion([MESA_1, MESA_2])).not.toThrow();
  });
});

describe('validarMesasParaUnion (RN-12, ADR-009)', () => {
  it('devuelve la zona común y la capacidad total si todas las mesas son unibles', () => {
    const resultado = validarMesasParaUnion(
      [MESA_1, MESA_2],
      [mesa(MESA_1, { capacidad: 4 }), mesa(MESA_2, { capacidad: 2 })],
    );

    expect(resultado).toEqual({ zona: 'Terraza', capacidadTotal: 6 });
  });

  it('404 MESA_NO_ENCONTRADA lista las mesas inexistentes o inactivas', () => {
    const error = capturar(() =>
      validarMesasParaUnion(
        [MESA_1, MESA_2, MESA_3],
        [mesa(MESA_1), mesa(MESA_2, { activo: false })],
      ),
    );

    expect(error).toEqual({
      status: 404,
      code: 'MESA_NO_ENCONTRADA',
      details: { mesasIds: [MESA_2, MESA_3] },
    });
  });

  it('T3.2 · 409 ZONA_INCOMPATIBLE si las mesas pertenecen a zonas distintas', () => {
    const error = capturar(() =>
      validarMesasParaUnion([MESA_1, MESA_2], [mesa(MESA_1), mesa(MESA_2, { zona: 'Principal' })]),
    );

    expect(error).toEqual({
      status: 409,
      code: 'ZONA_INCOMPATIBLE',
      details: { zonas: { [MESA_1]: 'Terraza', [MESA_2]: 'Principal' } },
    });
  });

  it('valida la zona antes que la disponibilidad', () => {
    const error = capturar(() =>
      validarMesasParaUnion(
        [MESA_1, MESA_2],
        [mesa(MESA_1, { estadoFisico: EstadoMesa.OCUPADA }), mesa(MESA_2, { zona: 'Principal' })],
      ),
    );

    expect(error.code).toBe('ZONA_INCOMPATIBLE');
  });

  it.each([
    ['ocupada', { estadoFisico: EstadoMesa.OCUPADA }],
    ['en limpieza', { estadoFisico: EstadoMesa.LIMPIEZA_PENDIENTE }],
    ['en otra unión', { unionMesaId: 'c1000000-0000-4000-8000-000000000001' }],
  ])('T3.3 · 409 MESA_NO_DISPONIBLE si una mesa está %s', (_caso, datos) => {
    const error = capturar(() =>
      validarMesasParaUnion([MESA_1, MESA_2], [mesa(MESA_1), mesa(MESA_2, datos)]),
    );

    expect(error.status).toBe(409);
    expect(error.code).toBe('MESA_NO_DISPONIBLE');
    expect(error.details).toEqual({
      mesas: [expect.objectContaining({ mesaId: MESA_2 })],
    });
  });
});
