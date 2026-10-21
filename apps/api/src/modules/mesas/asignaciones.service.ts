import { HttpStatus, Injectable } from '@nestjs/common';
import type { AsignacionDto, AsignarMeseroRequestDto } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import { Reloj } from '../../common/reloj/reloj';
import { aAsignacionDto } from './asignacion.dto.mapper';
import type { FiltroAsignaciones } from './asignacion.registro';
import { AsignacionesRepository } from './asignaciones.repository';

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATRON_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, campo: string): void {
  if (!PATRON_UUID.test(valor)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La solicitud contiene datos inválidos',
      { errores: [{ campo, mensaje: 'Debe ser un identificador UUID válido' }] },
    );
  }
}

function exigirUuidV4(valor: string, campo: string): void {
  if (!PATRON_UUID_V4.test(valor)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La solicitud contiene datos inválidos',
      { errores: [{ campo, mensaje: 'Debe ser un identificador UUID v4 válido' }] },
    );
  }
}

@Injectable()
export class AsignacionesService {
  constructor(
    private readonly repositorio: AsignacionesRepository,
    private readonly reloj: Reloj,
  ) {}

  /**
   * RF-010 · RF-011 · RN-16: asigna o reasigna el mesero responsable de una mesa activa.
   * Si existe una asignación activa previa, la cierra primero (activo=false, fechaHoraFin=ahora)
   * y crea la nueva dentro de la misma transacción para respetar el índice único parcial.
   */
  async asignar(mesaId: string, { meseroId }: AsignarMeseroRequestDto): Promise<AsignacionDto> {
    exigirUuid(mesaId, 'mesaId');
    exigirUuidV4(meseroId, 'meseroId');

    return this.repositorio.enTransaccion(async (repo) => {
      const mesaActiva = await repo.bloquearMesaActiva(mesaId);
      if (!mesaActiva) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          CODIGO_ERROR.MESA_NO_ENCONTRADA,
          'La mesa no existe o está inactiva',
          { mesaId },
        );
      }

      const previa = await repo.buscarActivaPorMesa(mesaId);
      const ahora = this.reloj.ahora();
      const instante =
        previa && ahora.getTime() <= previa.fechaHoraInicio.getTime()
          ? new Date(previa.fechaHoraInicio.getTime() + 1)
          : ahora;

      if (previa) {
        await repo.cerrar(previa.id, instante);
      }

      const nueva = await repo.crear({
        mesaId,
        meseroId,
        fechaHoraInicio: instante,
      });

      return aAsignacionDto(nueva);
    });
  }

  /** RF-011 · SPEC §5.3: lista asignaciones filtrando por meseroId y activo (por defecto true). */
  async listar(filtro: FiltroAsignaciones = {}): Promise<AsignacionDto[]> {
    if (filtro.meseroId !== undefined) {
      exigirUuidV4(filtro.meseroId, 'meseroId');
    }

    const asignaciones = await this.repositorio.listar({
      meseroId: filtro.meseroId,
      activo: filtro.activo ?? true,
    });
    return asignaciones.map(aAsignacionDto);
  }
}
