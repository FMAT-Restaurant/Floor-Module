import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  actualizarEstadoMesaSchema,
  mesaParamSchema,
  type ActualizarEstadoMesaRequestDto,
  type ActualizarEstadoMesaResponseDto,
  type MesaParamDto,
  type OcuparMesaResponseDto,
} from '@floor/shared';
import { Roles, ROLES_OPERACION_SALA } from '../../common/auth/auth.decorators';
import { resolverMeseroId, UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OcuparMesaDto, ocuparMesaDtoSchema } from './dto/ocupar-mesa.dto';
import { MesaEstadoService } from './mesa-estado.service';

@Controller('mesas')
export class MesaEstadoController {
  constructor(private readonly servicio: MesaEstadoService) {}

  @Patch(':mesaId/estado')
  @Roles(...ROLES_OPERACION_SALA)
  @HttpCode(HttpStatus.OK)
  actualizarEstado(
    @Param(new ZodValidationPipe(mesaParamSchema)) params: MesaParamDto,
    @Body(new ZodValidationPipe(actualizarEstadoMesaSchema)) cuerpo: ActualizarEstadoMesaRequestDto,
  ): Promise<ActualizarEstadoMesaResponseDto> {
    return this.servicio.actualizarEstado(params.mesaId, cuerpo);
  }

  @Post(':mesaId/ocupar')
  @Roles(...ROLES_OPERACION_SALA)
  @HttpCode(HttpStatus.OK)
  ocupar(
    @Param(new ZodValidationPipe(mesaParamSchema)) params: MesaParamDto | string,
    @Body(new ZodValidationPipe(ocuparMesaDtoSchema)) cuerpo: OcuparMesaDto,
    @UsuarioActual() usuarioActual?: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<OcuparMesaResponseDto> {
    const mesaId = typeof params === 'string' ? params : params.mesaId;
    const meseroId = resolverMeseroId(usuarioActual, cuerpo.meseroId);
    return this.servicio.ocupar(mesaId, cuerpo, meseroId, correlationId);
  }
}
