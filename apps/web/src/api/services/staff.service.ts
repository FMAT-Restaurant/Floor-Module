import type { MeseroCatalogoItem } from '@floor/shared';
import { apiClient, getAuthBaseUrl } from '../client';

export interface AuthStaffMemberDto {
  readonly id: string;
  readonly staffId?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly roles?: readonly string[];
  readonly isActive?: boolean;
}

type AuthStaffResponse = AuthStaffMemberDto[] | { readonly data?: AuthStaffMemberDto[] };

function formatNombreMesero(item: AuthStaffMemberDto): string {
  const nombreCompleto = [item.firstName, item.lastName]
    .filter((parte): parte is string => typeof parte === 'string' && parte.trim().length > 0)
    .map((parte) => parte.trim())
    .join(' ');
  return nombreCompleto || item.staffId?.trim() || item.id;
}

/**
 * Adapta la respuesta del directorio de Auth (`GET /api/v1/staff`)
 * al contrato `MeseroCatalogoItem` consumido por las vistas de Sala.
 */
export function mapAuthStaffToMeseroCatalogo(
  staff: AuthStaffResponse | null | undefined,
): MeseroCatalogoItem[] {
  const lista = Array.isArray(staff) ? staff : Array.isArray(staff?.data) ? staff.data : [];
  const porId = new Map<string, MeseroCatalogoItem>();

  for (const item of lista) {
    if (!item || typeof item.id !== 'string') {
      continue;
    }
    const meseroId = item.id.trim();
    if (!meseroId || porId.has(meseroId)) {
      continue;
    }
    porId.set(meseroId, {
      meseroId,
      nombre: formatNombreMesero(item),
      activo: item.isActive ?? true,
    });
  }

  return Array.from(porId.values());
}

/**
 * Consulta en Auth (`GET /api/v1/staff?role=MESERO&isActive=true`)
 * los meseros activos cuyo `id` coincide con el UUID `sub` / `meseroId`.
 */
export async function getMeserosCatalogo(): Promise<MeseroCatalogoItem[]> {
  const response = await apiClient.get<AuthStaffResponse>('/staff', {
    baseUrl: getAuthBaseUrl(),
    params: { role: 'MESERO', isActive: true },
  });
  return mapAuthStaffToMeseroCatalogo(response);
}
