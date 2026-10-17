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
  listar(@Query(validarQuery) query: ListarMesasQueryDto): Promise<MesaDto[]> {
    return this.servicio.listar(query);
  }

  // Debe declararse antes de ':mesaId', o "estado-en-vivo" se interpretaría como un id.
  @Get('estado-en-vivo')
  listarEnVivo(): Promise<MesaEnVivoDto[]> {
    return this.servicio.listarEnVivo();
  }

  @Get(':mesaId')
  obtener(@Param(validarParams) { mesaId }: MesaParamDto): Promise<MesaDto> {
    return this.servicio.obtener(mesaId);
  }

  @Post()
  crear(@Body(validarCreacion) cuerpo: CrearMesaRequestDto): Promise<MesaDto> {
    return this.servicio.crear(cuerpo);
  }

  @Patch(':mesaId')
  actualizar(
    @Param(validarParams) { mesaId }: MesaParamDto,
    @Body(validarActualizacion) cuerpo: ActualizarMesaRequestDto,
  ): Promise<MesaDto> {
    return this.servicio.actualizar(mesaId, cuerpo);
  }

  @Delete(':mesaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  darDeBaja(@Param(validarParams) { mesaId }: MesaParamDto): Promise<void> {
    return this.servicio.darDeBaja(mesaId);
  }
}
