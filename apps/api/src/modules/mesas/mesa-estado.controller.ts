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
import {
  resolverMeseroId,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../../common/decorators/usuario-actual.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ocuparMesaDtoSchema, type OcuparMesaDto } from './dto/ocupar-mesa.dto';
import { MesaEstadoService } from './mesa-estado.service';

const validarParams = new ZodValidationPipe(mesaParamSchema);
const validarOcupacion = new ZodValidationPipe(ocuparMesaDtoSchema);
const validarEstado = new ZodValidationPipe(actualizarEstadoMesaSchema);

function resolverMesaId(param: MesaParamDto | string): string {
  return typeof param === 'string' ? param : param.mesaId;
}

/** SPEC §5.2 · base path `/api/v1/floor` aplicado globalmente en app.setup.ts. */
@Controller('mesas')
export class MesaEstadoController {
  constructor(private readonly servicio: MesaEstadoService) {}

  @Post(':mesaId/ocupar')
  @HttpCode(HttpStatus.OK)
  ocupar(
    @Param(validarParams) param: MesaParamDto | string,
    @Body(validarOcupacion) cuerpo: OcuparMesaDto,
    @UsuarioActual() usuario?: UsuarioAutenticado | string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<OcuparMesaResponseDto> {
    const mesaId = resolverMesaId(param);
    const meseroId = resolverMeseroId(usuario, cuerpo.meseroId);
    return this.servicio.ocupar(mesaId, cuerpo, meseroId, correlationId);
  }

  @Patch(':mesaId/estado')
  actualizarEstado(
    @Param(validarParams) { mesaId }: MesaParamDto,
    @Body(validarEstado) cuerpo: ActualizarEstadoMesaRequestDto,
  ): Promise<ActualizarEstadoMesaResponseDto> {
    return this.servicio.actualizarEstado(mesaId, cuerpo);
  }
}
