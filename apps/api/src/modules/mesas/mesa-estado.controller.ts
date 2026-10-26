import { Body, Controller, Param, Patch } from '@nestjs/common';
import {
  actualizarEstadoMesaSchema,
  mesaParamSchema,
  type ActualizarEstadoMesaRequestDto,
  type ActualizarEstadoMesaResponseDto,
  type MesaParamDto,
} from '@floor/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ROLES_OPERACION_SALA, Roles } from '../../common/auth/auth.decorators';
import { MesaEstadoService } from './mesa-estado.service';

const validarParams = new ZodValidationPipe(mesaParamSchema);
const validarEstado = new ZodValidationPipe(actualizarEstadoMesaSchema);

/** SPEC §5.2 · base path `/sala` aplicado globalmente en app.setup.ts. */
@Controller('mesas')
export class MesaEstadoController {
  constructor(private readonly servicio: MesaEstadoService) {}

  @Patch(':mesaId/estado')
  @Roles(...ROLES_OPERACION_SALA)
  actualizarEstado(
    @Param(validarParams) { mesaId }: MesaParamDto,
    @Body(validarEstado) cuerpo: ActualizarEstadoMesaRequestDto,
  ): Promise<ActualizarEstadoMesaResponseDto> {
    return this.servicio.actualizarEstado(mesaId, cuerpo);
  }
}
