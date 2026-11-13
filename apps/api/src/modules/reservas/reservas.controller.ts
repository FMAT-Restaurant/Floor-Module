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
  actualizarReservaSchema,
  consultarDisponibilidadQuerySchema,
  crearReservaSchema,
  listarReservasQuerySchema,
  reservaParamSchema,
  type ActualizarReservaRequestDto,
  type ConsultarDisponibilidadQueryDto,
  type CrearReservaRequestDto,
  type CrearReservaResponseDto,
  type ListarReservasQueryDto,
  type MesaDto,
  type ReservaDto,
  type ReservaParamDto,
} from '@floor/shared';
import { PermisoSala, RequirePermissions } from '../../common/auth/auth.decorators';
import { ZodValidationPipe, type EsquemaValidable } from '../../common/pipes/zod-validation.pipe';
import { ReservasService } from './reservas.service';

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
  @RequirePermissions(PermisoSala.RESERVATIONS_VIEW)
  listar(@Query(validarFiltroListado) query: ListarReservasQueryDto): Promise<ReservaDto[]> {
    return this.servicio.listar(query);
  }

  // Debe declararse antes de ':reservaId' para que 'disponibilidad' no se interprete como un UUID.
  @Get('disponibilidad')
  @RequirePermissions(PermisoSala.RESERVATIONS_VIEW)
  consultarDisponibilidad(
    @Query(validarDisponibilidad) query: ConsultarDisponibilidadQueryDto,
  ): Promise<MesaDto[]> {
    return this.servicio.consultarDisponibilidad(query);
  }

  @Get(':reservaId')
  @RequirePermissions(PermisoSala.RESERVATIONS_VIEW)
  obtener(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.obtener(reservaId);
  }

  @Post()
  @RequirePermissions(PermisoSala.RESERVATIONS_CREATE)
  crear(@Body(validarCreacion) cuerpo: CrearReservaRequestDto): Promise<CrearReservaResponseDto> {
    return this.servicio.crear(cuerpo);
  }

  @Patch(':reservaId')
  @RequirePermissions(PermisoSala.RESERVATIONS_UPDATE)
  actualizar(
    @Param(validarParams) { reservaId }: ReservaParamDto,
    @Body(validarActualizacion) cuerpo: ActualizarReservaRequestDto,
  ): Promise<ReservaDto> {
    return this.servicio.actualizar(reservaId, cuerpo);
  }

  @Post(':reservaId/cancelar')
  @RequirePermissions(PermisoSala.RESERVATIONS_CANCEL)
  @HttpCode(HttpStatus.OK)
  cancelar(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.cancelar(reservaId);
  }

  @Delete(':reservaId')
  @RequirePermissions(PermisoSala.RESERVATIONS_CANCEL)
  eliminar(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.cancelar(reservaId);
  }

  @Post(':reservaId/no-show')
  @RequirePermissions(PermisoSala.RESERVATIONS_MARK_NO_SHOW)
  @HttpCode(HttpStatus.OK)
  marcarNoShow(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.marcarComoNoShow(reservaId);
  }
}
