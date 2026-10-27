import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  actualizarEstadoEsperaSchema,
  crearEsperaSchema,
  esperaParamSchema,
  listarEsperaQuerySchema,
  type ActualizarEstadoEsperaRequestDto,
  type CrearEsperaRequestDto,
  type EsperaDto,
  type EsperaParamDto,
  type ListarEsperaQueryDto,
} from '@floor/shared';
import { Roles, ROLES_GESTION_SALA, ROLES_OPERACION_SALA } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EsperaService } from './espera.service';

/**
 * BE-010 · SPEC §5.6 · RF-020 · RF-021 · RF-022:
 * Endpoints REST de la lista de espera presencial (`/sala/espera`).
 */
@Controller('espera')
export class EsperaController {
  constructor(private readonly servicio: EsperaService) {}

  @Post()
  @Roles(...ROLES_GESTION_SALA)
  @HttpCode(HttpStatus.CREATED)
  crear(
    @Body(new ZodValidationPipe(crearEsperaSchema)) cuerpo: CrearEsperaRequestDto,
  ): Promise<EsperaDto> {
    return this.servicio.crear(cuerpo);
  }

  @Get()
  @Roles(...ROLES_OPERACION_SALA)
  listar(
    @Query(new ZodValidationPipe(listarEsperaQuerySchema)) query: ListarEsperaQueryDto,
  ): Promise<EsperaDto[]> {
    return this.servicio.listar(query);
  }

  @Patch(':esperaId/estado')
  @Roles(...ROLES_GESTION_SALA)
  @HttpCode(HttpStatus.OK)
  actualizarEstado(
    @Param(new ZodValidationPipe(esperaParamSchema)) params: EsperaParamDto,
    @Body(new ZodValidationPipe(actualizarEstadoEsperaSchema))
    cuerpo: ActualizarEstadoEsperaRequestDto,
  ): Promise<EsperaDto> {
    return this.servicio.actualizarEstado(params.esperaId, cuerpo);
  }
}
