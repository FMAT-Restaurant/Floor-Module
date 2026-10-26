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
import { ROL, ROLES_OPERACION_SALA, Roles } from '../../common/auth/auth.decorators';
import { MesasService } from './mesas.service';

const validarQuery = new ZodValidationPipe(listarMesasQuerySchema);
const validarParams = new ZodValidationPipe(mesaParamSchema);
const validarCreacion = new ZodValidationPipe(crearMesaSchema);
const validarActualizacion = new ZodValidationPipe(actualizarMesaSchema);

/** SPEC §5.1 · base path `/sala` aplicado globalmente en app.setup.ts. */
@Controller('mesas')
export class MesasController {
  constructor(private readonly servicio: MesasService) {}

  @Get()
  @Roles(...ROLES_OPERACION_SALA)
  listar(@Query(validarQuery) query: ListarMesasQueryDto): Promise<MesaDto[]> {
    return this.servicio.listar(query);
  }

  // Debe declararse antes de ':mesaId', o "estado-en-vivo" se interpretaría como un id.
  @Get('estado-en-vivo')
  @Roles(...ROLES_OPERACION_SALA)
  listarEnVivo(): Promise<MesaEnVivoDto[]> {
    return this.servicio.listarEnVivo();
  }

  @Get(':mesaId')
  @Roles(...ROLES_OPERACION_SALA)
  obtener(@Param(validarParams) { mesaId }: MesaParamDto): Promise<MesaDto> {
    return this.servicio.obtener(mesaId);
  }

  @Post()
  @Roles(ROL.ADMINISTRADOR)
  crear(@Body(validarCreacion) cuerpo: CrearMesaRequestDto): Promise<MesaDto> {
    return this.servicio.crear(cuerpo);
  }

  @Patch(':mesaId')
  @Roles(ROL.ADMINISTRADOR)
  actualizar(
    @Param(validarParams) { mesaId }: MesaParamDto,
    @Body(validarActualizacion) cuerpo: ActualizarMesaRequestDto,
  ): Promise<MesaDto> {
    return this.servicio.actualizar(mesaId, cuerpo);
  }

  @Delete(':mesaId')
  @Roles(ROL.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  darDeBaja(@Param(validarParams) { mesaId }: MesaParamDto): Promise<void> {
    return this.servicio.darDeBaja(mesaId);
  }
}
