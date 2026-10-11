import type {
  ActualizarEstadoMesaRequestDto,
  ActualizarEstadoMesaResponseDto,
  ActualizarMesaRequestDto,
  CrearMesaRequestDto,
  ListarMesasQueryDto,
  MesaDto,
  MesaEnVivoDto,
  OcuparMesaRequestDto,
  OcuparMesaResponseDto,
} from '@floor/shared';
import { apiClient } from '../client';

export async function getMesas(query?: ListarMesasQueryDto): Promise<MesaDto[]> {
  return apiClient.get<MesaDto[]>('/mesas', {
    params: query as Record<string, unknown>,
  });
}

export async function getMesasEnVivo(): Promise<MesaEnVivoDto[]> {
  return apiClient.get<MesaEnVivoDto[]>('/mesas/estado-en-vivo');
}

export async function getMesa(id: string): Promise<MesaDto> {
  return apiClient.get<MesaDto>(`/mesas/${id}`);
}

export async function ocuparMesa(
  id: string,
  dto: OcuparMesaRequestDto,
): Promise<OcuparMesaResponseDto> {
  return apiClient.post<OcuparMesaResponseDto>(`/mesas/${id}/ocupar`, dto);
}

export async function cambiarEstadoMesa(
  id: string,
  dto: ActualizarEstadoMesaRequestDto,
): Promise<ActualizarEstadoMesaResponseDto> {
  return apiClient.patch<ActualizarEstadoMesaResponseDto>(`/mesas/${id}/estado`, dto);
}

export async function crearMesa(dto: CrearMesaRequestDto): Promise<MesaDto> {
  return apiClient.post<MesaDto>('/mesas', dto);
}

export async function actualizarMesa(id: string, dto: ActualizarMesaRequestDto): Promise<MesaDto> {
  return apiClient.patch<MesaDto>(`/mesas/${id}`, dto);
}

export async function eliminarMesa(id: string): Promise<void> {
  return apiClient.delete<void>(`/mesas/${id}`);
}
