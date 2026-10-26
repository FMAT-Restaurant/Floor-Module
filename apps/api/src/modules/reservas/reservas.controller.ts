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
import { ROLES_GESTION_SALA, ROLES_OPERACION_SALA, Roles } from '../../common/auth/auth.decorators';
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
  @Roles(...ROLES_OPERACION_SALA)
  listar(@Query(validarFiltroListado) query: ListarReservasQueryDto): Promise<ReservaDto[]> {
    return this.servicio.listar(query);
  }

  // Debe declararse antes de ':reservaId' para que 'disponibilidad' no se interprete como un UUID.
  @Get('disponibilidad')
  @Roles(...ROLES_OPERACION_SALA)
  consultarDisponibilidad(
    @Query(validarDisponibilidad) query: ConsultarDisponibilidadQueryDto,
  ): Promise<MesaDto[]> {
    return this.servicio.consultarDisponibilidad(query);
  }

  @Get(':reservaId')
  @Roles(...ROLES_OPERACION_SALA)
  obtener(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.obtener(reservaId);
  }

  @Post()
  @Roles(...ROLES_GESTION_SALA)
  crear(@Body(validarCreacion) cuerpo: CrearReservaRequestDto): Promise<CrearReservaResponseDto> {
    return this.servicio.crear(cuerpo);
  }

  @Patch(':reservaId')
  @Roles(...ROLES_GESTION_SALA)
  actualizar(
    @Param(validarParams) { reservaId }: ReservaParamDto,
    @Body(validarActualizacion) cuerpo: ActualizarReservaRequestDto,
  ): Promise<ReservaDto> {
    return this.servicio.actualizar(reservaId, cuerpo);
  }

  @Post(':reservaId/cancelar')
  @Roles(...ROLES_GESTION_SALA)
  @HttpCode(HttpStatus.OK)
  cancelar(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.cancelar(reservaId);
  }

  @Delete(':reservaId')
  @Roles(...ROLES_GESTION_SALA)
  eliminar(@Param(validarParams) { reservaId }: ReservaParamDto): Promise<ReservaDto> {
    return this.servicio.cancelar(reservaId);
  }
}
