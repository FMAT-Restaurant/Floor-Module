import type {
  ActualizarReservaRequestDto,
  ConsultarDisponibilidadQueryDto,
  CrearReservaRequestDto,
  CrearReservaResponseDto,
  ListarReservasQueryDto,
  MesaDto,
  ReservaDto,
} from '@floor/shared';
import { apiClient } from '../client';

export async function getReservas(query?: ListarReservasQueryDto): Promise<ReservaDto[]> {
  return apiClient.get<ReservaDto[]>('/reservas', {
    params: query as Record<string, unknown>,
  });
}

export async function crearReserva(dto: CrearReservaRequestDto): Promise<CrearReservaResponseDto> {
  return apiClient.post<CrearReservaResponseDto>('/reservas', dto);
}

export async function verificarDisponibilidad(
  query: ConsultarDisponibilidadQueryDto,
): Promise<MesaDto[]> {
  return apiClient.get<MesaDto[]>('/reservas/disponibilidad', {
    params: query as Record<string, unknown>,
  });
}

export async function cancelarReserva(id: string): Promise<ReservaDto> {
  return apiClient.post<ReservaDto>(`/reservas/${id}/cancelar`);
}

export async function noShowReserva(id: string): Promise<ReservaDto> {
  return apiClient.post<ReservaDto>(`/reservas/${id}/no-show`);
}

export async function actualizarReserva(
  id: string,
  dto: ActualizarReservaRequestDto,
): Promise<ReservaDto> {
  return apiClient.patch<ReservaDto>(`/reservas/${id}`, dto);
}
