import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  EstadoMesa,
  EstadoReserva,
  type ActualizarMesaRequestDto,
  type CrearMesaRequestDto,
  type ListarMesasQueryDto,
  type MesaDto,
  type MesaEnVivoDto,
} from '@floor/shared';
import { esUuidV4Valido } from '../../common/auth/jwt-hs256.util';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import { Reloj, obtenerAhoraRestaurante } from '../../common/reloj/reloj';
import { tieneReservaProxima, type ReservaAgendada } from './domain/reserva-proxima';
import { aMesaDto } from './mesa.dto.mapper';
import type { MesaRegistro, ReservaProximaRegistro } from './mesa.registro';
import { MesasRepository } from './mesas.repository';
import { VENTANA_RESERVA_PROXIMA_MINUTOS } from './mesas.tokens';

const MS_POR_MINUTO = 60_000;

function agruparPorMesa(
  reservas: readonly ReservaProximaRegistro[],
): Map<string, ReservaAgendada[]> {
  const grupos = new Map<string, ReservaAgendada[]>();
  for (const { mesaId, inicio } of reservas) {
    const grupo = grupos.get(mesaId) ?? [];
    grupo.push({ inicio, estado: EstadoReserva.CONFIRMADA });
    grupos.set(mesaId, grupo);
  }
  return grupos;
}

@Injectable()
export class MesasService {
  constructor(
    private readonly repositorio: MesasRepository,
    private readonly reloj: Reloj,
    @Inject(VENTANA_RESERVA_PROXIMA_MINUTOS) private readonly ventanaMinutos: number,
  ) {}

  async listar(filtro: ListarMesasQueryDto): Promise<MesaDto[]> {
    const mesas = await this.repositorio.listar(filtro);
    return mesas.map(aMesaDto);
  }

  /** RF-023 · RN-08: todas las mesas activas con su estado en vivo. */
  async listarEnVivo(): Promise<MesaEnVivoDto[]> {
    return this.obtenerMesasEnVivo();
  }

  /** RF-023 · RN-08 · RN-16: mesas activas asignadas actualmente al usuario autenticado. */
  async listarMias(meseroId: string): Promise<MesaEnVivoDto[]> {
    if (!esUuidV4Valido(meseroId)) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        CODIGO_ERROR.NO_AUTENTICADO,
        'No se encontró identidad verificada del usuario para consultar sus mesas',
      );
    }
    return this.obtenerMesasEnVivo(meseroId.trim());
  }

  private async obtenerMesasEnVivo(meseroId?: string): Promise<MesaEnVivoDto[]> {
    const ahora = obtenerAhoraRestaurante(this.reloj);
    const hasta = new Date(ahora.getTime() + this.ventanaMinutos * MS_POR_MINUTO);
    const [mesas, reservas] = await Promise.all([
      this.repositorio.listarEnVivo(meseroId),
      this.repositorio.reservasConfirmadasEntre(ahora, hasta),
    ]);
    const reservasPorMesa = agruparPorMesa(reservas);

    return mesas.map((mesa) => ({
      ...aMesaDto(mesa),
      tieneReservaProxima: tieneReservaProxima(
        reservasPorMesa.get(mesa.id) ?? [],
        ahora,
        this.ventanaMinutos,
      ),
      ocupadaDesde: mesa.ocupadaDesde ? mesa.ocupadaDesde.toISOString() : null,
      meseroId: mesa.meseroId,
    }));
  }

  async obtener(mesaId: string): Promise<MesaDto> {
    return aMesaDto(await this.buscarActivaOFallar(mesaId));
  }

  /** RF-001 · RN-19: la mesa nace `Libre` y su número debe ser único entre las activas. */
  async crear(datos: CrearMesaRequestDto): Promise<MesaDto> {
    await this.exigirNumeroDisponible(datos.numeroMesa);
    return aMesaDto(await this.repositorio.crear(datos));
  }

  /** RF-002 · RN-15: no se edita una mesa ocupada ni vinculada a una unión. */
  async actualizar(mesaId: string, datos: ActualizarMesaRequestDto): Promise<MesaDto> {
    return this.repositorio.enTransaccion(async (repo) => {
      const mesa = await this.buscarActivaOFallar(mesaId, repo);
      if (mesa.unionMesaId) throw this.mesaEnUnion(mesa.id);
      if (mesa.estadoFisico === EstadoMesa.OCUPADA) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          CODIGO_ERROR.MESA_NO_DISPONIBLE,
          'La mesa está ocupada y no puede modificarse',
          { mesaId: mesa.id },
        );
      }
      if (datos.numeroMesa !== undefined && datos.numeroMesa !== mesa.numeroMesa) {
        await this.exigirNumeroDisponible(datos.numeroMesa, mesa.id, repo);
      }
      if (datos.capacidad !== undefined && datos.capacidad < mesa.capacidad) {
        if (typeof repo.maxPersonasReservaConfirmadaFutura === 'function') {
          const maxReservado = await repo.maxPersonasReservaConfirmadaFutura(
            mesa.id,
            obtenerAhoraRestaurante(this.reloj),
          );
          if (datos.capacidad < maxReservado) {
            throw new DomainException(
              HttpStatus.CONFLICT,
              CODIGO_ERROR.TRANSICION_INVALIDA,
              `No se puede reducir la capacidad a ${datos.capacidad} porque existe una reserva confirmada para ${maxReservado} personas`,
              {
                mesaId: mesa.id,
                capacidadSolicitada: datos.capacidad,
                maxPersonasReservadas: maxReservado,
              },
            );
          }
        }
      }
      return aMesaDto(await repo.actualizar(mesa.id, datos));
    });
  }

  /** RF-003 · RN-18: baja lógica sólo si está Libre, sin unión y sin reservas confirmadas. */
  async darDeBaja(mesaId: string): Promise<void> {
    await this.repositorio.enTransaccion(async (repo) => {
      const mesa = await this.buscarActivaOFallar(mesaId, repo);
      if (mesa.unionMesaId) throw this.mesaEnUnion(mesa.id);
      if (mesa.estadoFisico !== EstadoMesa.LIBRE) {
        throw this.bajaRechazada('Sólo se puede dar de baja una mesa libre', {
          mesaId: mesa.id,
          motivo: 'MESA_NO_LIBRE',
        });
      }
      const reservas = await repo.contarReservasConfirmadasFuturas(
        mesa.id,
        obtenerAhoraRestaurante(this.reloj),
      );
      if (reservas > 0) {
        throw this.bajaRechazada('La mesa tiene reservas confirmadas pendientes', {
          mesaId: mesa.id,
          motivo: 'RESERVAS_CONFIRMADAS',
          reservas,
        });
      }
      await repo.darDeBaja(mesa.id);
    });
  }

  private async buscarActivaOFallar(
    mesaId: string,
    repo: MesasRepository = this.repositorio,
  ): Promise<MesaRegistro> {
    const mesa = await repo.buscarPorId(mesaId);
    if (!mesa?.activo) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        CODIGO_ERROR.MESA_NO_ENCONTRADA,
        'La mesa no existe o está inactiva',
        { mesaId },
      );
    }
    return mesa;
  }

  private async exigirNumeroDisponible(
    numeroMesa: number,
    excluirMesaId?: string,
    repo: MesasRepository = this.repositorio,
  ): Promise<void> {
    const existe = await repo.existeMesaActivaConNumero(numeroMesa, excluirMesaId);
    if (existe) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        CODIGO_ERROR.NUMERO_MESA_DUPLICADO,
        'Ya existe una mesa activa con ese número',
        { numeroMesa },
      );
    }
  }

  private mesaEnUnion(mesaId: string): DomainException {
    return new DomainException(
      HttpStatus.CONFLICT,
      CODIGO_ERROR.MESA_EN_UNION,
      'La mesa pertenece a una unión activa',
      { mesaId },
    );
  }

  private bajaRechazada(mensaje: string, detalles: Record<string, unknown>): DomainException {
    return new DomainException(
      HttpStatus.CONFLICT,
      CODIGO_ERROR.TRANSICION_INVALIDA,
      mensaje,
      detalles,
    );
  }
}
