import { EstadoMesa } from '@floor/shared';
import { MesaEstadoController } from './mesa-estado.controller';
import type { MesaEstadoService } from './mesa-estado.service';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';

describe('MesaEstadoController', () => {
  it('delega en el servicio con el mesaId de la ruta y el cuerpo validado', async () => {
    const respuesta = { mesaId: MESA_ID, estado: EstadoMesa.LIBRE };
    const servicio = {
      actualizarEstado: jest.fn().mockResolvedValue(respuesta),
    } as unknown as jest.Mocked<MesaEstadoService>;
    const controlador = new MesaEstadoController(servicio);

    const resultado = await controlador.actualizarEstado(
      { mesaId: MESA_ID },
      { estado: EstadoMesa.LIBRE },
    );

    expect(resultado).toBe(respuesta);
    expect(servicio.actualizarEstado).toHaveBeenCalledWith(MESA_ID, { estado: EstadoMesa.LIBRE });
  });
});
