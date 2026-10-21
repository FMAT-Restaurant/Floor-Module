import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CODIGO_ERROR } from './codigos-error';
import { DomainException } from './domain.exception';

interface ReglaTraduccion {
  /** Nombre de la restricción o índice tal como lo crea la migración. */
  restriccion: string;
  /** Campo con el que Prisma reporta un P2002 sobre un índice único parcial. */
  campoUnico?: string;
  codigo: string;
  mensaje: string;
}

/** SPEC §9: violaciones de restricciones de BD se traducen a 409 con código de dominio. */
const REGLAS: readonly ReglaTraduccion[] = [
  {
    restriccion: 'mesa_numero_activo_uidx',
    campoUnico: 'numero_mesa',
    codigo: CODIGO_ERROR.NUMERO_MESA_DUPLICADO,
    mensaje: 'Ya existe una mesa activa con ese número',
  },
  {
    restriccion: 'reserva_no_solapada_excl',
    codigo: CODIGO_ERROR.RESERVA_SOLAPADA,
    mensaje: 'La mesa ya tiene una reserva confirmada que se cruza con ese horario',
  },
];

function esErrorPrisma(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  );
}

function coincide(regla: ReglaTraduccion, error: Error): boolean {
  if (error.message.includes(regla.restriccion)) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002' || !regla.campoUnico) return false;
  return JSON.stringify(error.meta?.target ?? '').includes(regla.campoUnico);
}

/** Devuelve el 409 de dominio equivalente, o null si el error no es una restricción conocida. */
export function traducirErrorPrisma(error: unknown): DomainException | null {
  if (!esErrorPrisma(error)) return null;
  const regla = REGLAS.find((candidata) => coincide(candidata, error));
  if (!regla) return null;
  return new DomainException(HttpStatus.CONFLICT, regla.codigo, regla.mensaje);
}
