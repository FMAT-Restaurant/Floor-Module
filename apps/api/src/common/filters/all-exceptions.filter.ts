import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponseDto } from '@floor/shared';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import { traducirErrorPrisma } from '../errors/prisma-error.translator';

const CODIGO_POR_ESTADO: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: CODIGO_ERROR.VALIDACION,
  [HttpStatus.UNAUTHORIZED]: CODIGO_ERROR.NO_AUTENTICADO,
  [HttpStatus.FORBIDDEN]: CODIGO_ERROR.NO_AUTORIZADO,
  [HttpStatus.NOT_FOUND]: CODIGO_ERROR.NO_ENCONTRADO,
  [HttpStatus.PAYLOAD_TOO_LARGE]: CODIGO_ERROR.PAYLOAD_DEMASIADO_GRANDE,
};

const MENSAJE_ERROR_INTERNO = 'Error interno del servidor';

/** Error 4xx que genera Express/body-parser (JSON mal formado, payload demasiado grande). */
interface ErrorHttpExpress {
  status: number;
  message: string;
}

function esErrorHttpExpress(valor: unknown): valor is ErrorHttpExpress {
  if (typeof valor !== 'object' || valor === null) return false;
  const { status, message } = valor as Record<string, unknown>;
  return (
    typeof status === 'number' &&
    status >= HttpStatus.BAD_REQUEST &&
    status < HttpStatus.INTERNAL_SERVER_ERROR &&
    typeof message === 'string'
  );
}

/** Convierte cualquier excepción al formato de error estándar; nunca filtra detalles internos. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    const cuerpo = this.aCuerpoDeError(exception);
    respuesta.status(cuerpo.statusCode).json(cuerpo);
  }

  private aCuerpoDeError(exception: unknown): ApiErrorResponseDto {
    if (exception instanceof DomainException) {
      return exception.getResponse() as ApiErrorResponseDto;
    }
    const traducido = traducirErrorPrisma(exception);
    if (traducido) {
      return traducido.getResponse() as ApiErrorResponseDto;
    }
    if (
      exception instanceof HttpException &&
      exception.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      return this.desdeEstado(exception.getStatus(), exception.message);
    }
    if (esErrorHttpExpress(exception)) {
      return this.desdeEstado(exception.status, exception.message);
    }
    return this.errorInterno(exception);
  }

  private desdeEstado(statusCode: number, message: string): ApiErrorResponseDto {
    return {
      statusCode,
      code: CODIGO_POR_ESTADO[statusCode] ?? CODIGO_ERROR.ERROR_SOLICITUD,
      message,
      details: {},
    };
  }

  private errorInterno(exception: unknown): ApiErrorResponseDto {
    const esError = exception instanceof Error;
    this.logger.error(
      esError ? exception.message : 'Excepción no controlada',
      esError ? exception.stack : undefined,
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: CODIGO_ERROR.ERROR_INTERNO,
      message: MENSAJE_ERROR_INTERNO,
      details: {},
    };
  }
}
