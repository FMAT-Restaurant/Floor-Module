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
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import { Reloj } from '../../common/reloj/reloj';
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
    const ahora = this.reloj.ahora();
    const hasta = new Date(ahora.getTime() + this.ventanaMinutos * MS_POR_MINUTO);
    const [mesas, reservas] = await Promise.all([
      this.repositorio.listarEnVivo(),
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
    const mesa = await this.buscarActivaOFallar(mesaId);
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
      await this.exigirNumeroDisponible(datos.numeroMesa, mesa.id);
    }
    return aMesaDto(await this.repositorio.actualizar(mesa.id, datos));
  }

  /** RF-003 · RN-18: baja lógica sólo si está Libre, sin unión y sin reservas confirmadas. */
  async darDeBaja(mesaId: string): Promise<void> {
    const mesa = await this.buscarActivaOFallar(mesaId);
    if (mesa.unionMesaId) throw this.mesaEnUnion(mesa.id);
    if (mesa.estadoFisico !== EstadoMesa.LIBRE) {
      throw this.bajaRechazada('Sólo se puede dar de baja una mesa libre', {
        mesaId: mesa.id,
        motivo: 'MESA_NO_LIBRE',
      });
    }
    const reservas = await this.repositorio.contarReservasConfirmadasFuturas(
      mesa.id,
      this.reloj.ahora(),
    );
    if (reservas > 0) {
      throw this.bajaRechazada('La mesa tiene reservas confirmadas pendientes', {
        mesaId: mesa.id,
        motivo: 'RESERVAS_CONFIRMADAS',
        reservas,
      });
    }
    await this.repositorio.darDeBaja(mesa.id);
  }

  private async buscarActivaOFallar(mesaId: string): Promise<MesaRegistro> {
    const mesa = await this.repositorio.buscarPorId(mesaId);
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

  private async exigirNumeroDisponible(numeroMesa: number, excluirMesaId?: string): Promise<void> {
    const existe = await this.repositorio.existeMesaActivaConNumero(numeroMesa, excluirMesaId);
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
