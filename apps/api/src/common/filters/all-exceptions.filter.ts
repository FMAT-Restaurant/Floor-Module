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
      return this.desdeHttp(exception);
    }
    return this.errorInterno(exception);
  }

  private desdeHttp(exception: HttpException): ApiErrorResponseDto {
    const statusCode = exception.getStatus();
    return {
      statusCode,
      code: CODIGO_POR_ESTADO[statusCode] ?? CODIGO_ERROR.ERROR_SOLICITUD,
      message: exception.message,
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
