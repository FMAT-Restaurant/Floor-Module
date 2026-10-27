import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  crearUnionSchema,
  listarUnionesQuerySchema,
  unionParamSchema,
  type CrearUnionRequestDto,
  type CrearUnionResponseDto,
  type LiberarUnionResponseDto,
  type ListarUnionesQueryDto,
  type UnionDto,
  type UnionParamDto,
} from '@floor/shared';
import { Roles, ROLES_GESTION_SALA, ROLES_OPERACION_SALA } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UnionesService } from './uniones.service';

/**
 * SPEC §5.5 · RF-018 · RF-019. El módulo se registra antes que `MesasModule` para que
 * `GET /mesas/uniones` no sea capturado por `GET /mesas/:mesaId`.
 */
@Controller('mesas/uniones')
export class UnionesController {
  constructor(private readonly servicio: UnionesService) {}

  @Get()
  @Roles(...ROLES_OPERACION_SALA)
  listar(
    @Query(new ZodValidationPipe(listarUnionesQuerySchema)) query: ListarUnionesQueryDto,
  ): Promise<UnionDto[]> {
    return this.servicio.listar(query.estado);
  }

  @Post()
  @Roles(...ROLES_GESTION_SALA)
  @HttpCode(HttpStatus.CREATED)
  crear(
    @Body(new ZodValidationPipe(crearUnionSchema)) cuerpo: CrearUnionRequestDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<CrearUnionResponseDto> {
    return this.servicio.crear(cuerpo, correlationId);
  }

  @Post(':unionId/liberar')
  @Roles(...ROLES_GESTION_SALA)
  @HttpCode(HttpStatus.OK)
  liberar(
    @Param(new ZodValidationPipe(unionParamSchema)) params: UnionParamDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<LiberarUnionResponseDto> {
    return this.servicio.liberar(params.unionId, correlationId);
  }
}
