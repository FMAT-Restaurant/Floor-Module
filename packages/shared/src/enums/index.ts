export enum EstadoMesa {
  LIBRE = 'Libre',
  OCUPADA = 'Ocupada',
  LIMPIEZA_PENDIENTE = 'Limpieza pendiente',
}

export enum EstadoReserva {
  CONFIRMADA = 'Confirmada',
  CANCELADA = 'Cancelada',
  COMPLETADA = 'Completada',
  NO_SHOW = 'No-show',
}

export enum EstadoEspera {
  EN_ESPERA = 'En espera',
  NOTIFICADO = 'Notificado',
  SENTADO = 'Sentado',
  CANCELADO = 'Cancelado',
}

export enum EstadoUnion {
  ACTIVA = 'Activa',
  DISUELTA = 'Disuelta',
}

export enum RoleEnum {
  ADMINISTRADOR = 'ADMINISTRADOR',
  ADMIN = 'ADMIN',
  HOST = 'HOST',
  GESTOR_MENU = 'GESTOR_MENU',
  ALMACENISTA = 'ALMACENISTA',
  MESERO = 'MESERO',
  CHEF_MASTER = 'CHEF_MASTER',
  CAJERO = 'CAJERO',
}

export enum PermisoSala {
  TABLES_VIEW = 'sala:tables:view',
  TABLES_CREATE = 'sala:tables:create',
  TABLES_UPDATE = 'sala:tables:update',
  TABLES_DELETE = 'sala:tables:delete',
  TABLES_OCCUPY = 'sala:tables:occupy',
  TABLES_UPDATE_STATUS = 'sala:tables:update_status',
  TABLES_ASSIGN_WAITER = 'sala:tables:assign_waiter',
  ASSIGNMENTS_VIEW = 'sala:assignments:view',
  TABLE_UNIONS_VIEW = 'sala:table_unions:view',
  TABLE_UNIONS_CREATE = 'sala:table_unions:create',
  TABLE_UNIONS_RELEASE = 'sala:table_unions:release',
  RESERVATIONS_VIEW = 'sala:reservations:view',
  RESERVATIONS_CREATE = 'sala:reservations:create',
  RESERVATIONS_UPDATE = 'sala:reservations:update',
  RESERVATIONS_CANCEL = 'sala:reservations:cancel',
  RESERVATIONS_MARK_NO_SHOW = 'sala:reservations:mark_no_show',
  WAITLIST_ENTRIES_VIEW = 'sala:waitlist_entries:view',
  WAITLIST_ENTRIES_CREATE = 'sala:waitlist_entries:create',
  WAITLIST_ENTRIES_UPDATE_STATUS = 'sala:waitlist_entries:update_status',
}

export const SALA_PERMISSIONS: readonly PermisoSala[] = Object.values(PermisoSala);
