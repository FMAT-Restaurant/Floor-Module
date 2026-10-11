import type {
  CrearUnionRequestDto,
  CrearUnionResponseDto,
  LiberarUnionResponseDto,
  ListarUnionesQueryDto,
  UnionDto,
} from '@floor/shared';
import { apiClient } from '../client';

export async function getUniones(query?: ListarUnionesQueryDto): Promise<UnionDto[]> {
  return apiClient.get<UnionDto[]>('/mesas/uniones', {
    params: query as Record<string, unknown>,
  });
}

export async function crearUnion(dto: CrearUnionRequestDto): Promise<CrearUnionResponseDto> {
  return apiClient.post<CrearUnionResponseDto>('/mesas/uniones', dto);
}

export async function liberarUnion(id: string): Promise<LiberarUnionResponseDto> {
  return apiClient.post<LiberarUnionResponseDto>(`/mesas/uniones/${id}/liberar`);
}
