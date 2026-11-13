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
import { PermisoSala, RequirePermissions } from '../../common/auth/auth.decorators';
import { AsignacionesService } from './asignaciones.service';

const validarParams = new ZodValidationPipe(mesaParamSchema);
const validarAsignacion = new ZodValidationPipe(asignarMeseroSchema);
const validarFiltro = new ZodValidationPipe(listarAsignacionesQuerySchema);

/** SPEC §5.3 · base path `/api/v1/floor` aplicado globalmente en app.setup.ts. */
@Controller()
export class AsignacionesController {
  constructor(private readonly servicio: AsignacionesService) {}

  @Put('mesas/:mesaId/mesero')
  @RequirePermissions(PermisoSala.TABLES_ASSIGN_WAITER)
  asignar(
    @Param(validarParams) { mesaId }: MesaParamDto,
    @Body(validarAsignacion) cuerpo: AsignarMeseroRequestDto,
  ): Promise<AsignacionDto> {
    return this.servicio.asignar(mesaId, cuerpo);
  }

  @Get('asignaciones')
  @RequirePermissions(PermisoSala.ASSIGNMENTS_VIEW)
  listar(@Query(validarFiltro) query: ListarAsignacionesQueryDto): Promise<AsignacionDto[]> {
    return this.servicio.listar(query);
  }
}
