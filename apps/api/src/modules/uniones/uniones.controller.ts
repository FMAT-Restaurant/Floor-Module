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
import { PermisoSala, RequirePermissions } from '../../common/auth/auth.decorators';
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
  @RequirePermissions(PermisoSala.TABLE_UNIONS_VIEW)
  listar(
    @Query(new ZodValidationPipe(listarUnionesQuerySchema)) query: ListarUnionesQueryDto,
  ): Promise<UnionDto[]> {
    return this.servicio.listar(query.estado);
  }

  @Post()
  @RequirePermissions(PermisoSala.TABLE_UNIONS_CREATE)
  @HttpCode(HttpStatus.CREATED)
  crear(
    @Body(new ZodValidationPipe(crearUnionSchema)) cuerpo: CrearUnionRequestDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<CrearUnionResponseDto> {
    return this.servicio.crear(cuerpo, correlationId);
  }

  @Post(':unionId/liberar')
  @RequirePermissions(PermisoSala.TABLE_UNIONS_RELEASE)
  @HttpCode(HttpStatus.OK)
  liberar(
    @Param(new ZodValidationPipe(unionParamSchema)) params: UnionParamDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<LiberarUnionResponseDto> {
    return this.servicio.liberar(params.unionId, correlationId);
  }
}
