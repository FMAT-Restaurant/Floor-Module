import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  asignarMeseroSchema,
  listarAsignacionesQuerySchema,
  mesaParamSchema,
  type AsignacionDto,
  type AsignarMeseroRequestDto,
  type ListarAsignacionesQueryDto,
  type MesaParamDto,
} from '@floor/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ROLES_GESTION_SALA, ROLES_OPERACION_SALA, Roles } from '../../common/auth/auth.decorators';
import { AsignacionesService } from './asignaciones.service';

const validarParams = new ZodValidationPipe(mesaParamSchema);
const validarAsignacion = new ZodValidationPipe(asignarMeseroSchema);
const validarFiltro = new ZodValidationPipe(listarAsignacionesQuerySchema);

/** SPEC §5.3 · base path `/sala` aplicado globalmente en app.setup.ts. */
@Controller()
export class AsignacionesController {
  constructor(private readonly servicio: AsignacionesService) {}

  @Put('mesas/:mesaId/mesero')
  @Roles(...ROLES_GESTION_SALA)
  asignar(
    @Param(validarParams) { mesaId }: MesaParamDto,
    @Body(validarAsignacion) cuerpo: AsignarMeseroRequestDto,
  ): Promise<AsignacionDto> {
    return this.servicio.asignar(mesaId, cuerpo);
  }

  @Get('asignaciones')
  @Roles(...ROLES_OPERACION_SALA)
  listar(@Query(validarFiltro) query: ListarAsignacionesQueryDto): Promise<AsignacionDto[]> {
    return this.servicio.listar(query);
  }
}
