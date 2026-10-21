import { ArgumentsHost, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function crearHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter · formato de error estándar (SPEC §1 y §9)', () => {
  const filtro = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('respeta una DomainException tal cual', () => {
    const { host, status, json } = crearHost();
    const error = new DomainException(409, CODIGO_ERROR.MESA_EN_UNION, 'La mesa está unida', {
      mesaId: 'x',
    });

    filtro.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      code: CODIGO_ERROR.MESA_EN_UNION,
      message: 'La mesa está unida',
      details: { mesaId: 'x' },
    });
  });

  it('convierte una HttpException 404 al formato estándar', () => {
    const { host, status, json } = crearHost();

    filtro.catch(new NotFoundException('Ruta no encontrada'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: CODIGO_ERROR.NO_ENCONTRADO }),
    );
  });

  it('RN-19: traduce una violación de unicidad a 409, nunca 500', () => {
    const { host, status, json } = crearHost();
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['numero_mesa'] },
    });

    filtro.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: CODIGO_ERROR.NUMERO_MESA_DUPLICADO }),
    );
  });

  it('SPEC §1: un payload demasiado grande (error de body-parser) responde 413', () => {
    const { host, status, json } = crearHost();
    const error = Object.assign(new Error('request entity too large'), { status: 413 });

    filtro.catch(error, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: CODIGO_ERROR.PAYLOAD_DEMASIADO_GRANDE }),
    );
  });

  it('un JSON mal formado (error de body-parser) responde 400 VALIDACION', () => {
    const { host, status, json } = crearHost();
    const error = Object.assign(new SyntaxError('Unexpected end of JSON input'), { status: 400 });

    filtro.catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: CODIGO_ERROR.VALIDACION }));
  });

  it('responde 500 ERROR_INTERNO sin filtrar el mensaje original', () => {
    const { host, status, json } = crearHost();

    filtro.catch(new Error('password=secreta en la cadena de conexión'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const cuerpo = json.mock.calls[0][0];
    expect(cuerpo.code).toBe(CODIGO_ERROR.ERROR_INTERNO);
    expect(JSON.stringify(cuerpo)).not.toContain('secreta');
  });
});
