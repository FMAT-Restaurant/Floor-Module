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
  HOST = 'HOST',
  ALMACENISTA = 'ALMACENISTA',
  MESERO = 'MESERO',
  CHEF_MASTER = 'CHEF_MASTER',
}
