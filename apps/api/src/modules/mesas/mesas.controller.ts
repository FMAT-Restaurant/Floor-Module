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
  actualizarMesaSchema,
  crearMesaSchema,
  listarMesasQuerySchema,
  mesaParamSchema,
  type ActualizarMesaRequestDto,
  type CrearMesaRequestDto,
  type ListarMesasQueryDto,
  type MesaDto,
  type MesaEnVivoDto,
  type MesaParamDto,
} from '@floor/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermisoSala, RequirePermissions } from '../../common/auth/auth.decorators';
import { resolverMeseroId, UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { MesasService } from './mesas.service';

const validarQuery = new ZodValidationPipe(listarMesasQuerySchema);
const validarParams = new ZodValidationPipe(mesaParamSchema);
const validarCreacion = new ZodValidationPipe(crearMesaSchema);
const validarActualizacion = new ZodValidationPipe(actualizarMesaSchema);

/** SPEC §5.1 · base path `/api/v1/floor` aplicado globalmente en app.setup.ts. */
@Controller('mesas')
export class MesasController {
  constructor(private readonly servicio: MesasService) {}

  @Get()
  @RequirePermissions(PermisoSala.TABLES_VIEW)
  listar(@Query(validarQuery) query: ListarMesasQueryDto): Promise<MesaDto[]> {
    return this.servicio.listar(query);
  }

  // Debe declararse antes de ':mesaId', o "estado-en-vivo" / "mias" se interpretarían como un id.
  @Get('estado-en-vivo')
  @RequirePermissions(PermisoSala.TABLES_VIEW)
  listarEnVivo(): Promise<MesaEnVivoDto[]> {
    return this.servicio.listarEnVivo();
  }

  @Get('mias')
  @RequirePermissions(PermisoSala.TABLES_VIEW)
  listarMias(@UsuarioActual() usuarioActual?: unknown): Promise<MesaEnVivoDto[]> {
    return this.servicio.listarMias(resolverMeseroId(usuarioActual));
  }

  @Get(':mesaId')
  @RequirePermissions(PermisoSala.TABLES_VIEW)
  obtener(@Param(validarParams) { mesaId }: MesaParamDto): Promise<MesaDto> {
    return this.servicio.obtener(mesaId);
  }

  @Post()
  @RequirePermissions(PermisoSala.TABLES_CREATE)
  crear(@Body(validarCreacion) cuerpo: CrearMesaRequestDto): Promise<MesaDto> {
    return this.servicio.crear(cuerpo);
  }

  @Patch(':mesaId')
  @RequirePermissions(PermisoSala.TABLES_UPDATE)
  actualizar(
    @Param(validarParams) { mesaId }: MesaParamDto,
    @Body(validarActualizacion) cuerpo: ActualizarMesaRequestDto,
  ): Promise<MesaDto> {
    return this.servicio.actualizar(mesaId, cuerpo);
  }

  @Delete(':mesaId')
  @RequirePermissions(PermisoSala.TABLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  darDeBaja(@Param(validarParams) { mesaId }: MesaParamDto): Promise<void> {
    return this.servicio.darDeBaja(mesaId);
  }
}
