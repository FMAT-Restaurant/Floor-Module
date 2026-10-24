import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  EstadoReserva,
  actualizarReservaSchema,
  consultarDisponibilidadQuerySchema,
  crearReservaSchema,
  listarReservasQuerySchema,
  reservaParamSchema,
  type ConsultarDisponibilidadQueryDto,
  type CrearReservaRequestDto,
  type CrearReservaResponseDto,
  type ListarReservasQueryDto,
  type MesaDto,
  type ReservaDto,
  type ReservaParamDto,
} from '@floor/shared';
import { ZodValidationPipe, type EsquemaValidable } from '../../common/pipes/zod-validation.pipe';
import { ReservasService, type ActualizarReservaEntrada } from './reservas.service';

const ESTADOS_PATCH_PERMITIDOS = new Set<string>([
  EstadoReserva.CONFIRMADA,
  EstadoReserva.CANCELADA,
]);

export const esquemaDisponibilidad: EsquemaValidable = {
  safeParse(valor: unknown) {
    if (typeof valor === 'object' && valor !== null) {
      const raw = valor as Record<string, unknown>;
      return consultarDisponibilidadQuerySchema.safeParse({
        ...raw,
        horaInicio: raw.horaInicio ?? raw.hora,
        personas: raw.personas ?? raw.aforo,
      });
    }
    return consultarDisponibilidadQuerySchema.safeParse(valor);
  },
};

export const esquemaActualizar: EsquemaValidable = {
  safeParse(valor: unknown) {
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
      return actualizarReservaSchema.safeParse(valor);
    }
    const raw = { ...(valor as Record<string, unknown>) };
    if (raw.horaInicio === undefined && raw.hora !== undefined) {
      raw.horaInicio = raw.hora;
      delete raw.hora;
    }

    const estadoRaw = raw.estado;
    if (estadoRaw !== undefined) {
      if (typeof estadoRaw !== 'string' || !ESTADOS_PATCH_PERMITIDOS.has(estadoRaw)) {
        return {
          success: false,
          error: {
            issues: [{ path: ['estado'], message: 'Estado de reserva inválido' }],
          },
        };
      }
      const sinEstado = { ...raw };
      delete sinEstado.estado;
      if (Object.keys(sinEstado).length === 0) {
        return {
          success: true,
          data: { estado: estadoRaw as EstadoReserva },
        };
      }
      const parsed = actualizarReservaSchema.safeParse(sinEstado);
      if (!parsed.success) return parsed;
      return {
        success: true,
        data: { ...parsed.data, estado: estadoRaw as EstadoReserva },
      };
    }

    return actualizarReservaSchema.safeParse(raw);
  },
};

const validarFiltroListado = new ZodValidationPipe(listarReservasQuerySchema);
const validarDisponibilidad = new ZodValidationPipe(esquemaDisponibilidad);
const validarParams = new ZodValidationPipe(reservaParamSchema);
const validarCreacion = new ZodValidationPipe(crearReservaSchema);
const validarActualizacion = new ZodValidationPipe(esquemaActualizar);

/** SPEC §5.4 · base path `/api/v1/floor` aplicado globalmente en app.setup.ts → `/api/v1/floor/reservas`. */
@Controller('reservas')
export class ReservasController {
  constructor(private readonly servicio: ReservasService) {}

  @Get()
  listar(@Query(validarFiltroListado) query: ListarReservasQueryDto): Promise<ReservaDto[]> {
    return this.servicio.listar(query);
  }

  // Debe declararse antes de ':reservaId' para que 'disponibilidad' no se interprete como un UUID.
  @Get('disponibilidad')
  consultarDisponibilidad(
    @Query(validarDisponibilidad) query: ConsultarDisponibilidadQueryDto,
  ): Promise<MesaDto[]> {
    return this.servicio.consultarDisponibilidad(query);
  }

  @Get(':reservaId')
  obtener(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.obtener(reservaId);
  }

  @Post()
  crear(@Body(validarCreacion) cuerpo: CrearReservaRequestDto): Promise<CrearReservaResponseDto> {
    return this.servicio.crear(cuerpo);
  }

  @Patch(':reservaId')
  actualizar(
    @Param(validarParams) { reservaId }: ReservaParamDto,
    @Body(validarActualizacion) cuerpo: ActualizarReservaEntrada,
  ): Promise<ReservaDto> {
    return this.servicio.actualizar(reservaId, cuerpo);
  }

  @Post(':reservaId/cancelar')
  @HttpCode(HttpStatus.OK)
  cancelar(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.cancelar(reservaId);
  }

  @Delete(':reservaId')
  eliminar(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.cancelar(reservaId);
  }
}
