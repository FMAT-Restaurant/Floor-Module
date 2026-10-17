import { actualizarMesaSchema, crearMesaSchema, listarMesasQuerySchema } from '@floor/shared';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

function capturar(accion: () => unknown): DomainException {
  try {
    accion();
  } catch (error) {
    return error as DomainException;
  }
  throw new Error('Se esperaba una excepción de validación');
}

describe('ZodValidationPipe (SPEC §8)', () => {
  it('devuelve los datos parseados cuando son válidos', () => {
    const pipe = new ZodValidationPipe(crearMesaSchema);

    expect(pipe.transform({ numeroMesa: 1, capacidad: 4, zona: '  Terraza ' })).toEqual({
      numeroMesa: 1,
      capacidad: 4,
      zona: 'Terraza',
    });
  });

  it('rechaza con 400 VALIDACION e indica el campo inválido', () => {
    const pipe = new ZodValidationPipe(crearMesaSchema);

    const error = capturar(() => pipe.transform({ numeroMesa: 0, capacidad: 4, zona: 'Bar' }));

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      code: CODIGO_ERROR.VALIDACION,
      details: { errores: [expect.objectContaining({ campo: 'numeroMesa' })] },
    });
  });

  it('rechaza propiedades desconocidas (whitelist)', () => {
    const pipe = new ZodValidationPipe(crearMesaSchema);

    const error = capturar(() =>
      pipe.transform({ numeroMesa: 1, capacidad: 4, zona: 'Bar', estadoFisico: 'Ocupada' }),
    );

    expect(error.getStatus()).toBe(400);
  });

  it('PATCH sin ningún campo es inválido', () => {
    const pipe = new ZodValidationPipe(actualizarMesaSchema);

    expect(capturar(() => pipe.transform({})).getStatus()).toBe(400);
  });

  it('en la query, incluirInactivas vale false por defecto', () => {
    const pipe = new ZodValidationPipe(listarMesasQuerySchema);

    expect(pipe.transform({})).toEqual({ incluirInactivas: false });
  });
});
