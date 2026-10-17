import { Prisma } from '@prisma/client';
import { CODIGO_ERROR } from './codigos-error';
import { traducirErrorPrisma } from './prisma-error.translator';

const CLIENT_VERSION = '6.19.3';

function conocido(code: string, message: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: CLIENT_VERSION,
    meta,
  });
}

describe('traducirErrorPrisma (SPEC §9)', () => {
  it('RN-19: P2002 sobre numero_mesa → 409 NUMERO_MESA_DUPLICADO', () => {
    const error = conocido('P2002', 'Unique constraint failed on the fields: (`numero_mesa`)', {
      modelName: 'Mesa',
      target: ['numero_mesa'],
    });

    const resultado = traducirErrorPrisma(error);

    expect(resultado?.getStatus()).toBe(409);
    expect(resultado?.getResponse()).toMatchObject({ code: CODIGO_ERROR.NUMERO_MESA_DUPLICADO });
  });

  it('RN-19: error crudo que menciona el índice parcial → NUMERO_MESA_DUPLICADO', () => {
    const error = new Prisma.PrismaClientUnknownRequestError(
      'duplicate key value violates unique constraint "mesa_numero_activo_uidx"',
      { clientVersion: CLIENT_VERSION },
    );

    expect(traducirErrorPrisma(error)?.getResponse()).toMatchObject({
      code: CODIGO_ERROR.NUMERO_MESA_DUPLICADO,
    });
  });

  it('RN-09: violación 23P01 de reserva_no_solapada_excl → 409 RESERVA_SOLAPADA', () => {
    const error = conocido(
      'P2010',
      'Raw query failed. Code: `23P01`. Message: `conflicting key value violates exclusion constraint "reserva_no_solapada_excl"`',
      { code: '23P01' },
    );

    const resultado = traducirErrorPrisma(error);

    expect(resultado?.getStatus()).toBe(409);
    expect(resultado?.getResponse()).toMatchObject({ code: CODIGO_ERROR.RESERVA_SOLAPADA });
  });

  it('no traduce un P2002 sobre otro campo', () => {
    const error = conocido('P2002', 'Unique constraint failed on the fields: (`otro`)', {
      target: ['otro'],
    });

    expect(traducirErrorPrisma(error)).toBeNull();
  });

  it('no traduce errores que no son de Prisma', () => {
    expect(traducirErrorPrisma(new Error('numero_mesa'))).toBeNull();
    expect(traducirErrorPrisma('texto')).toBeNull();
  });
});
