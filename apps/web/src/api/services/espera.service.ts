import type {
  ActualizarEstadoEsperaRequestDto,
  CrearEsperaRequestDto,
  EsperaDto,
  ListarEsperaQueryDto,
} from '@floor/shared';
import { apiClient } from '../client';

export async function getListaEspera(query?: ListarEsperaQueryDto): Promise<EsperaDto[]> {
  return apiClient.get<EsperaDto[]>('/espera', {
    params: query as Record<string, unknown>,
  });
}

export async function registrarEspera(dto: CrearEsperaRequestDto): Promise<EsperaDto> {
  return apiClient.post<EsperaDto>('/espera', dto);
}

export async function cambiarEstadoEspera(
  id: string,
  dto: ActualizarEstadoEsperaRequestDto,
): Promise<EsperaDto> {
  return apiClient.patch<EsperaDto>(`/espera/${id}/estado`, dto);
}
