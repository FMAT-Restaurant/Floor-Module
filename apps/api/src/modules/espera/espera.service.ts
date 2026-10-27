import { Injectable, Optional } from '@nestjs/common';
import {
  type ActualizarEstadoEsperaRequestDto,
  type CrearEsperaRequestDto,
  type EsperaDto,
  type EsperaMesaDisponiblePayload,
  type ListarEsperaQueryDto,
} from '@floor/shared';
import { Reloj } from '../../common/reloj/reloj';
import { SalaWebSocketGateway } from '../../gateways/sala.gateway';
import {
  esTransicionEsperaPermitida,
  filtrarYOrdenarColaEspera,
  resolverEstadosFiltroEspera,
  resolverMesaAsignadaEnTransicion,
  seleccionarSiguienteCompatibleFifo,
} from './domain/cola-espera';
import { aEsperaDto } from './espera.dto.mapper';
import { esperaNoEncontrada, transicionEsperaInvalida } from './espera.errores';
import { EsperaRepository } from './espera.repository';

/**
 * BE-010 · RF-020 · RF-021 · RF-022 · RN-17 · SPEC §5.6 · F4:
 * Gestiona la lista de espera presencial en orden FIFO y notifica por WebSocket
 * a recepción cuando una mesa compatible queda libre tras su limpieza.
 */
@Injectable()
export class EsperaService {
  constructor(
    private readonly repositorio: EsperaRepository,
    @Optional() private readonly gateway?: SalaWebSocketGateway,
    @Optional() private readonly reloj: Reloj = new Reloj(),
  ) {}

  /** RF-021 · SPEC §5.6: registra un cliente en espera presencial con `horaLlegada` automática. */
  async crear(datos: CrearEsperaRequestDto): Promise<EsperaDto> {
    const creada = await this.repositorio.crear(datos, this.reloj.ahora());
    return aEsperaDto(creada);
  }

  /** SPEC §5.6: lista entradas de espera (por defecto `En espera` y `Notificado`) en orden FIFO. */
  async listar(filtro: ListarEsperaQueryDto = {}): Promise<EsperaDto[]> {
    const estados = resolverEstadosFiltroEspera(filtro.estado);
    const registros = await this.repositorio.listar(estados);
    return filtrarYOrdenarColaEspera(registros, filtro.estado).map(aEsperaDto);
  }

  /**
   * RF-022 · SPEC §4.3 · §5.6: actualiza el estado de una entrada de espera (`Sentado`, `Cancelado`, `En espera`).
   * Rechaza con 409 `TRANSICION_INVALIDA` si ya estaba `Sentado` o `Cancelado` o si la transición no es válida.
   */
  async actualizarEstado(
    esperaId: string,
    { estado }: ActualizarEstadoEsperaRequestDto,
  ): Promise<EsperaDto> {
    return this.repositorio.enTransaccion(async (repo) => {
      const actual = await repo.buscarPorId(esperaId);
      if (!actual) {
        throw esperaNoEncontrada(esperaId);
      }

      if (!esTransicionEsperaPermitida(actual.estado, estado)) {
        throw transicionEsperaInvalida(actual.id, actual.estado, estado);
      }

      const mesaAsignadaId = resolverMesaAsignadaEnTransicion(estado, actual.mesaAsignadaId);
      const actualizada = await repo.transicionarEstado(
        actual.id,
        actual.estado,
        estado,
        mesaAsignadaId,
      );
      if (!actualizada) {
        throw transicionEsperaInvalida(actual.id, actual.estado, estado);
      }

      return aEsperaDto(actualizada);
    });
  }

  /**
   * RN-17 · RF-020 · F4: al quedar una mesa `Libre`, busca en orden FIFO el cliente `En espera`
   * más antiguo con `cantidadPersonas <= capacidadMesa`, lo transiciona a `Notificado` con
   * `idMesaAsignada = mesaId` y emite `espera.mesa_disponible` por WebSocket a recepción.
   */
  async notificarSiguienteCompatible(
    mesaId: string,
    capacidadMesa: number,
  ): Promise<EsperaDto | null> {
    const notificado = await this.repositorio.enTransaccion(async (repo) => {
      const candidatos = await repo.bloquearCandidatosEnEspera(capacidadMesa);
      const elegido = seleccionarSiguienteCompatibleFifo(candidatos, capacidadMesa);
      if (!elegido) {
        return null;
      }
      return repo.marcarNotificado(elegido.id, mesaId);
    });

    if (!notificado) {
      return null;
    }

    const payload: EsperaMesaDisponiblePayload = {
      mesaId,
      esperaId: notificado.id,
      cliente: {
        nombre: notificado.nombreCliente,
        cantidadPersonas: notificado.cantidadPersonas,
      },
    };
    this.gateway?.emitirEsperaMesaDisponible(payload);

    return aEsperaDto(notificado);
  }
}
