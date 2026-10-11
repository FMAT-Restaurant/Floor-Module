import {
  EstadoEspera,
  EstadoMesa,
  EstadoReserva,
  EstadoUnion,
  fixtureAsignaciones,
  fixtureListaEspera,
  fixtureMesasEnVivo,
  fixtureMeserosCatalogo,
  fixtureReservas,
  fixtureUniones,
  type ActualizarMesaRequestDto,
  type ActualizarReservaRequestDto,
  type AsignacionDto,
  type ConsultarDisponibilidadQueryDto,
  type CrearEsperaRequestDto,
  type CrearMesaRequestDto,
  type CrearReservaRequestDto,
  type CrearUnionRequestDto,
  type EsperaDto,
  type ListarAsignacionesQueryDto,
  type ListarEsperaQueryDto,
  type ListarMesasQueryDto,
  type ListarReservasQueryDto,
  type ListarUnionesQueryDto,
  type MesaDto,
  type MesaEnVivoDto,
  type MeseroCatalogoItem,
  type OcuparMesaRequestDto,
  type OcuparMesaResponseDto,
  type ReservaDto,
  type UnionDto,
} from '@floor/shared';

export class MockApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MockApiError';
  }

  toResponse() {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export interface TransitionWaitlistMatch {
  esperaId: string;
  cliente: {
    nombre: string;
    cantidadPersonas: number;
  };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class MockDatabase {
  private mesas: MesaEnVivoDto[] = [];
  private meseros: MeseroCatalogoItem[] = [];
  private asignaciones: AsignacionDto[] = [];
  private reservas: ReservaDto[] = [];
  private uniones: UnionDto[] = [];
  private espera: EsperaDto[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.mesas = clone(fixtureMesasEnVivo);
    this.meseros = clone(fixtureMeserosCatalogo);
    this.asignaciones = clone(fixtureAsignaciones);
    this.reservas = clone(fixtureReservas);
    this.uniones = clone(fixtureUniones);
    this.espera = clone(fixtureListaEspera);
  }

  getState() {
    return {
      mesas: clone(this.mesas),
      meseros: clone(this.meseros),
      asignaciones: clone(this.asignaciones),
      reservas: clone(this.reservas),
      uniones: clone(this.uniones),
      espera: clone(this.espera),
    };
  }

  // --- MESAS ---
  getMesas(query?: Partial<ListarMesasQueryDto>): MesaDto[] {
    let list = this.mesas;
    if (!query?.incluirInactivas) {
      list = list.filter((m) => m.activo);
    }
    if (query?.zona) {
      list = list.filter((m) => m.zona.toLowerCase() === query.zona!.toLowerCase());
    }
    if (query?.estado) {
      list = list.filter((m) => m.estadoFisico === query.estado);
    }
    return list.map(({ tieneReservaProxima: _p, ocupadaDesde: _o, meseroId: _m, ...base }) => ({
      ...base,
    }));
  }

  getMesasEnVivo(): MesaEnVivoDto[] {
    return clone(this.mesas.filter((m) => m.activo));
  }

  getMesa(mesaId: string): MesaDto {
    const found = this.mesas.find((m) => m.mesaId === mesaId);
    if (!found) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${mesaId} no encontrada`);
    }
    const { tieneReservaProxima: _p, ocupadaDesde: _o, meseroId: _m, ...base } = found;
    return clone(base);
  }

  getMesaEnVivo(mesaId: string): MesaEnVivoDto {
    const found = this.mesas.find((m) => m.mesaId === mesaId);
    if (!found) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${mesaId} no encontrada`);
    }
    return clone(found);
  }

  crearMesa(data: CrearMesaRequestDto): MesaDto {
    const exists = this.mesas.some((m) => m.activo && m.numeroMesa === data.numeroMesa);
    if (exists) {
      throw new MockApiError(
        409,
        'NUMERO_MESA_DUPLICADO',
        `Ya existe una mesa activa con el número ${data.numeroMesa}`,
      );
    }
    const nueva: MesaEnVivoDto = {
      mesaId: generateUuid(),
      numeroMesa: data.numeroMesa,
      capacidad: data.capacidad,
      zona: data.zona,
      estadoFisico: EstadoMesa.LIBRE,
      unionId: null,
      activo: true,
      tieneReservaProxima: false,
      ocupadaDesde: null,
      meseroId: null,
    };
    this.mesas.push(nueva);
    const { tieneReservaProxima: _p, ocupadaDesde: _o, meseroId: _m, ...base } = nueva;
    return clone(base);
  }

  actualizarMesa(mesaId: string, data: ActualizarMesaRequestDto): MesaDto {
    const mesa = this.mesas.find((m) => m.mesaId === mesaId);
    if (!mesa) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${mesaId} no encontrada`);
    }
    if (data.numeroMesa !== undefined && data.numeroMesa !== mesa.numeroMesa) {
      const exists = this.mesas.some(
        (m) => m.mesaId !== mesaId && m.activo && m.numeroMesa === data.numeroMesa,
      );
      if (exists) {
        throw new MockApiError(
          409,
          'NUMERO_MESA_DUPLICADO',
          `Ya existe otra mesa activa con el número ${data.numeroMesa}`,
        );
      }
      mesa.numeroMesa = data.numeroMesa;
    }
    if (data.capacidad !== undefined) {
      mesa.capacidad = data.capacidad;
    }
    if (data.zona !== undefined) {
      mesa.zona = data.zona;
    }
    const { tieneReservaProxima: _p, ocupadaDesde: _o, meseroId: _m, ...base } = mesa;
    return clone(base);
  }

  eliminarMesa(mesaId: string): void {
    const mesa = this.mesas.find((m) => m.mesaId === mesaId);
    if (!mesa) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${mesaId} no encontrada`);
    }
    if (mesa.unionId) {
      throw new MockApiError(
        409,
        'MESA_EN_UNION',
        'No se puede dar de baja una mesa vinculada a una unión',
      );
    }
    if (mesa.estadoFisico !== EstadoMesa.LIBRE) {
      throw new MockApiError(
        409,
        'TRANSICION_INVALIDA',
        'Solo se puede dar de baja una mesa en estado Libre',
      );
    }
    mesa.activo = false;
  }

  // --- CICLO OPERATIVO ---
  ocuparMesa(mesaId: string, data: OcuparMesaRequestDto): OcuparMesaResponseDto {
    const mesa = this.mesas.find((m) => m.mesaId === mesaId && m.activo);
    if (!mesa) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${mesaId} no encontrada o inactiva`);
    }
    if (mesa.unionId) {
      throw new MockApiError(
        409,
        'MESA_EN_UNION',
        'La mesa pertenece a una unión activa. Ocupe la unión completa.',
      );
    }
    if (mesa.estadoFisico !== EstadoMesa.LIBRE) {
      throw new MockApiError(
        409,
        'MESA_NO_DISPONIBLE',
        `La mesa no está disponible (estado actual: ${mesa.estadoFisico})`,
      );
    }
    if (mesa.tieneReservaProxima && !data.forzarOcupacion) {
      throw new MockApiError(
        409,
        'RESERVA_PROXIMA_PRESENTE',
        'La mesa tiene una reserva próxima dentro de la ventana de anticipación',
      );
    }
    if (data.comensales > mesa.capacidad && !data.forzarSobrecupo) {
      throw new MockApiError(
        409,
        'SOBRECUPO_DETECTADO',
        `La cantidad de comensales (${data.comensales}) supera la capacidad (${mesa.capacidad})`,
      );
    }

    // Actualizar mesa
    mesa.estadoFisico = EstadoMesa.OCUPADA;
    mesa.ocupadaDesde = new Date().toISOString();
    mesa.meseroId = data.meseroId;

    // Asignación de mesero (cerrar previas y crear nueva)
    this.asignarMesero(mesaId, data.meseroId);

    // Si viene reserva, completarla
    if (data.reservaId) {
      const res = this.reservas.find((r) => r.reservaId === data.reservaId);
      if (res && res.estado === EstadoReserva.CONFIRMADA) {
        res.estado = EstadoReserva.COMPLETADA;
      }
    }

    // Si viene espera, marcar sentado
    if (data.esperaId) {
      const esp = this.espera.find((e) => e.esperaId === data.esperaId);
      if (esp) {
        esp.estado = EstadoEspera.SENTADO;
        esp.idMesaAsignada = mesaId;
      }
    }

    const sessionId = generateUuid();
    return {
      mesaId,
      estado: EstadoMesa.OCUPADA,
      sessionId,
      advertencias: data.forzarSobrecupo
        ? ['Ocupación autorizada con sobrecupo confirmado']
        : undefined,
    };
  }

  actualizarEstadoMesa(
    mesaId: string,
    nuevoEstado: EstadoMesa,
  ): { mesaId: string; estado: EstadoMesa; waitlistMatch?: TransitionWaitlistMatch } {
    const mesa = this.mesas.find((m) => m.mesaId === mesaId && m.activo);
    if (!mesa) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${mesaId} no encontrada`);
    }
    if (mesa.unionId) {
      throw new MockApiError(
        409,
        'MESA_EN_UNION',
        'No se puede cambiar el estado individual de una mesa unida',
      );
    }

    if (mesa.estadoFisico === EstadoMesa.OCUPADA && nuevoEstado === EstadoMesa.LIMPIEZA_PENDIENTE) {
      mesa.estadoFisico = EstadoMesa.LIMPIEZA_PENDIENTE;
      mesa.ocupadaDesde = null;
      return { mesaId, estado: EstadoMesa.LIMPIEZA_PENDIENTE };
    }

    if (mesa.estadoFisico === EstadoMesa.LIMPIEZA_PENDIENTE && nuevoEstado === EstadoMesa.LIBRE) {
      mesa.estadoFisico = EstadoMesa.LIBRE;
      mesa.ocupadaDesde = null;

      // RN-17: Evaluar lista de espera FIFO
      let waitlistMatch: TransitionWaitlistMatch | undefined;
      const candidatoEspera = this.espera.find(
        (e) => e.estado === EstadoEspera.EN_ESPERA && e.cantidadPersonas <= mesa.capacidad,
      );
      if (candidatoEspera) {
        candidatoEspera.estado = EstadoEspera.NOTIFICADO;
        candidatoEspera.idMesaAsignada = mesaId;
        waitlistMatch = {
          esperaId: candidatoEspera.esperaId,
          cliente: {
            nombre: candidatoEspera.nombreCliente,
            cantidadPersonas: candidatoEspera.cantidadPersonas,
          },
        };
      }

      return { mesaId, estado: EstadoMesa.LIBRE, waitlistMatch };
    }

    throw new MockApiError(
      409,
      'TRANSICION_INVALIDA',
      `Transición no permitida de ${mesa.estadoFisico} a ${nuevoEstado}`,
    );
  }

  // --- MESEROS & ASIGNACIONES ---
  getAsignaciones(query?: ListarAsignacionesQueryDto): AsignacionDto[] {
    let list = this.asignaciones;
    if (query?.activo !== undefined) {
      list = list.filter((a) => a.activo === query.activo);
    }
    if (query?.meseroId) {
      list = list.filter((a) => a.meseroId === query.meseroId);
    }
    return clone(list);
  }

  asignarMesero(mesaId: string, meseroId: string): AsignacionDto {
    const mesa = this.mesas.find((m) => m.mesaId === mesaId && m.activo);
    if (!mesa) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${mesaId} no encontrada`);
    }

    const now = new Date().toISOString();
    // Cerrar asignación previa
    this.asignaciones
      .filter((a) => a.mesaId === mesaId && a.activo)
      .forEach((a) => {
        a.activo = false;
        a.fechaHoraFin = now;
      });

    // Crear nueva asignación
    const nueva: AsignacionDto = {
      asignacionId: generateUuid(),
      mesaId,
      meseroId,
      fechaHoraInicio: now,
      fechaHoraFin: null,
      activo: true,
    };
    this.asignaciones.push(nueva);
    mesa.meseroId = meseroId;
    return clone(nueva);
  }

  // --- RESERVAS ---
  getReservas(query?: ListarReservasQueryDto): ReservaDto[] {
    let list = this.reservas;
    if (query?.fecha) {
      list = list.filter((r) => r.fecha === query.fecha);
    }
    if (query?.mesaId) {
      list = list.filter((r) => r.mesaId === query.mesaId);
    }
    if (query?.estado) {
      list = list.filter((r) => r.estado === query.estado);
    }
    return clone(list);
  }

  getDisponibilidad(query: ConsultarDisponibilidadQueryDto): MesaDto[] {
    const queryStart = timeToMinutes(query.horaInicio);
    const queryEnd = queryStart + query.duracion;

    const mesasCandidatas = this.mesas.filter((m) => m.activo && m.capacidad >= query.personas);

    const disponibles = mesasCandidatas.filter((mesa) => {
      const solapada = this.reservas.some((r) => {
        if (
          r.mesaId !== mesa.mesaId ||
          r.fecha !== query.fecha ||
          r.estado !== EstadoReserva.CONFIRMADA
        ) {
          return false;
        }
        const rStart = timeToMinutes(r.horaInicio);
        const rEnd = timeToMinutes(r.horaFin);
        return intervalsOverlap(queryStart, queryEnd, rStart, rEnd);
      });
      return !solapada;
    });

    return disponibles.map(
      ({ tieneReservaProxima: _p, ocupadaDesde: _o, meseroId: _m, ...base }) => ({
        ...base,
      }),
    );
  }

  crearReserva(data: CrearReservaRequestDto): {
    reservaId: string;
    mesaId: string;
    estado: EstadoReserva;
  } {
    const mesaExiste = this.mesas.some((m) => m.mesaId === data.mesaId && m.activo);
    if (!mesaExiste) {
      throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${data.mesaId} no encontrada`);
    }

    const startMin = timeToMinutes(data.horaInicio);
    const endMin = startMin + data.duracion;
    const horaFin = minutesToTime(endMin);

    // Verificar solapamiento (RN-09)
    const solapa = this.reservas.some((r) => {
      if (
        r.mesaId !== data.mesaId ||
        r.fecha !== data.fecha ||
        r.estado !== EstadoReserva.CONFIRMADA
      ) {
        return false;
      }
      const rStart = timeToMinutes(r.horaInicio);
      const rEnd = timeToMinutes(r.horaFin);
      return intervalsOverlap(startMin, endMin, rStart, rEnd);
    });

    if (solapa) {
      throw new MockApiError(
        409,
        'RESERVA_SOLAPADA',
        'Mesa reservada en ese horario. Conflicto con reserva existente.',
      );
    }

    const reservaId = generateUuid();
    const nueva: ReservaDto = {
      reservaId,
      mesaId: data.mesaId,
      nombreContacto: data.cliente.nombre,
      telefonoContacto: data.cliente.tel,
      cantidadPersonas: data.cantidadPersonas,
      fecha: data.fecha,
      horaInicio: data.horaInicio,
      horaFin,
      estado: EstadoReserva.CONFIRMADA,
    };
    this.reservas.push(nueva);

    return {
      reservaId,
      mesaId: data.mesaId,
      estado: EstadoReserva.CONFIRMADA,
    };
  }

  actualizarReserva(reservaId: string, data: ActualizarReservaRequestDto): ReservaDto {
    const reserva = this.reservas.find((r) => r.reservaId === reservaId);
    if (!reserva) {
      throw new MockApiError(404, 'RESERVA_NO_ENCONTRADA', `Reserva ${reservaId} no encontrada`);
    }
    if (reserva.estado !== EstadoReserva.CONFIRMADA) {
      throw new MockApiError(
        409,
        'TRANSICION_INVALIDA',
        'Solo se pueden reprogramar reservas en estado Confirmada',
      );
    }

    const targetMesaId = data.mesaId ?? reserva.mesaId;
    const targetFecha = data.fecha ?? reserva.fecha;
    const targetHoraInicio = data.horaInicio ?? reserva.horaInicio;
    const startMin = timeToMinutes(targetHoraInicio);

    let endMin: number;
    if (data.duracion !== undefined) {
      endMin = startMin + data.duracion;
    } else {
      const durActual = timeToMinutes(reserva.horaFin) - timeToMinutes(reserva.horaInicio);
      endMin = startMin + durActual;
    }
    const targetHoraFin = minutesToTime(endMin);

    // Validar solapamiento con otras reservas
    const solapa = this.reservas.some((r) => {
      if (
        r.reservaId === reservaId ||
        r.mesaId !== targetMesaId ||
        r.fecha !== targetFecha ||
        r.estado !== EstadoReserva.CONFIRMADA
      ) {
        return false;
      }
      const rStart = timeToMinutes(r.horaInicio);
      const rEnd = timeToMinutes(r.horaFin);
      return intervalsOverlap(startMin, endMin, rStart, rEnd);
    });

    if (solapa) {
      throw new MockApiError(
        409,
        'RESERVA_SOLAPADA',
        'La nueva franja horaria se solapa con otra reserva existente',
      );
    }

    reserva.mesaId = targetMesaId;
    reserva.fecha = targetFecha;
    reserva.horaInicio = targetHoraInicio;
    reserva.horaFin = targetHoraFin;
    if (data.cantidadPersonas !== undefined) {
      reserva.cantidadPersonas = data.cantidadPersonas;
    }

    return clone(reserva);
  }

  cancelarReserva(reservaId: string): ReservaDto {
    const reserva = this.reservas.find((r) => r.reservaId === reservaId);
    if (!reserva) {
      throw new MockApiError(404, 'RESERVA_NO_ENCONTRADA', `Reserva ${reservaId} no encontrada`);
    }
    if (reserva.estado !== EstadoReserva.CONFIRMADA) {
      throw new MockApiError(
        409,
        'TRANSICION_INVALIDA',
        'Solo se pueden cancelar reservas en estado Confirmada',
      );
    }
    reserva.estado = EstadoReserva.CANCELADA;
    return clone(reserva);
  }

  noShowReserva(reservaId: string): ReservaDto {
    const reserva = this.reservas.find((r) => r.reservaId === reservaId);
    if (!reserva) {
      throw new MockApiError(404, 'RESERVA_NO_ENCONTRADA', `Reserva ${reservaId} no encontrada`);
    }
    if (reserva.estado !== EstadoReserva.CONFIRMADA) {
      throw new MockApiError(
        409,
        'TRANSICION_INVALIDA',
        'Solo se pueden marcar como No-show reservas en estado Confirmada',
      );
    }
    reserva.estado = EstadoReserva.NO_SHOW;
    return clone(reserva);
  }

  // --- UNIONES ---
  getUniones(query?: ListarUnionesQueryDto): UnionDto[] {
    let list = this.uniones;
    if (query?.estado) {
      list = list.filter((u) => u.estado === query.estado);
    }
    return clone(list);
  }

  crearUnion(data: CrearUnionRequestDto): {
    unionId: string;
    mesasIds: string[];
    estado: EstadoMesa;
    sessionId: string;
  } {
    if (data.mesasIds.length < 2) {
      throw new MockApiError(400, 'UNION_INVALIDA', 'Se requieren al menos 2 mesas para una unión');
    }

    const mesasParticipantes: MesaEnVivoDto[] = [];
    for (const id of data.mesasIds) {
      const mesa = this.mesas.find((m) => m.mesaId === id && m.activo);
      if (!mesa) {
        throw new MockApiError(404, 'MESA_NO_ENCONTRADA', `Mesa ${id} no encontrada o inactiva`);
      }
      mesasParticipantes.push(mesa);
    }

    // RN-12: Todas deben ser de la misma zona
    const zonaComun = mesasParticipantes[0].zona;
    const zonaIncompatible = mesasParticipantes.some((m) => m.zona !== zonaComun);
    if (zonaIncompatible) {
      throw new MockApiError(
        409,
        'ZONA_INCOMPATIBLE',
        'Todas las mesas de la unión deben pertenecer a la misma zona',
      );
    }

    for (const mesa of mesasParticipantes) {
      if (mesa.unionId) {
        throw new MockApiError(
          409,
          'MESA_EN_UNION',
          `La mesa ${mesa.numeroMesa} ya pertenece a otra unión`,
        );
      }
      if (mesa.estadoFisico !== EstadoMesa.LIBRE) {
        throw new MockApiError(
          409,
          'MESA_NO_DISPONIBLE',
          `La mesa ${mesa.numeroMesa} no está Libre (estado: ${mesa.estadoFisico})`,
        );
      }
    }

    // Advertencia por reserva próxima
    const tieneReserva = mesasParticipantes.some((m) => m.tieneReservaProxima);
    if (tieneReserva && !data.forzarOcupacion) {
      throw new MockApiError(
        409,
        'RESERVA_PROXIMA_PRESENTE',
        'Una o más mesas tienen reserva próxima en la ventana de 30 min',
      );
    }

    // Sobrecupo
    const capacidadTotal = mesasParticipantes.reduce((sum, m) => sum + m.capacidad, 0);
    if (data.totalPersonas > capacidadTotal && !data.forzarSobrecupo) {
      throw new MockApiError(
        409,
        'SOBRECUPO_DETECTADO',
        `El total de personas (${data.totalPersonas}) supera la capacidad unida (${capacidadTotal})`,
      );
    }

    const unionId = generateUuid();
    const sessionId = generateUuid();
    const now = new Date().toISOString();

    const nuevaUnion: UnionDto = {
      unionId,
      zona: zonaComun,
      mesasIds: [...data.mesasIds],
      estado: EstadoUnion.ACTIVA,
      fechaCreacion: now,
      fechaDisolucion: null,
    };
    this.uniones.push(nuevaUnion);

    // Ocupar mesas
    for (const mesa of mesasParticipantes) {
      mesa.estadoFisico = EstadoMesa.OCUPADA;
      mesa.unionId = unionId;
      mesa.ocupadaDesde = now;
      mesa.meseroId = data.meseroId;
      this.asignarMesero(mesa.mesaId, data.meseroId);
    }

    return {
      unionId,
      mesasIds: [...data.mesasIds],
      estado: EstadoMesa.OCUPADA,
      sessionId,
    };
  }

  liberarUnion(unionId: string): { mesasIds: string[]; estado: EstadoMesa } {
    const union = this.uniones.find((u) => u.unionId === unionId);
    if (!union) {
      throw new MockApiError(404, 'UNION_NO_ENCONTRADA', `Unión ${unionId} no encontrada`);
    }
    if (union.estado !== EstadoUnion.ACTIVA) {
      throw new MockApiError(
        409,
        'TRANSICION_INVALIDA',
        'Solo se puede liberar una unión en estado Activa',
      );
    }

    union.estado = EstadoUnion.DISUELTA;
    union.fechaDisolucion = new Date().toISOString();

    // RN-14: Cada mesa pasa a Limpieza pendiente y unionId = null
    for (const mesaId of union.mesasIds) {
      const mesa = this.mesas.find((m) => m.mesaId === mesaId);
      if (mesa) {
        mesa.unionId = null;
        mesa.estadoFisico = EstadoMesa.LIMPIEZA_PENDIENTE;
        mesa.ocupadaDesde = null;
      }
    }

    return {
      mesasIds: [...union.mesasIds],
      estado: EstadoMesa.LIMPIEZA_PENDIENTE,
    };
  }

  // --- LISTA DE ESPERA ---
  getEspera(query?: ListarEsperaQueryDto): EsperaDto[] {
    let list = this.espera;
    if (query?.estado) {
      list = list.filter((e) => e.estado === query.estado);
    } else {
      list = list.filter(
        (e) => e.estado === EstadoEspera.EN_ESPERA || e.estado === EstadoEspera.NOTIFICADO,
      );
    }
    // Ordenar por horaLlegada ASC
    const sorted = [...list].sort(
      (a, b) => new Date(a.horaLlegada).getTime() - new Date(b.horaLlegada).getTime(),
    );
    return clone(sorted);
  }

  crearEspera(data: CrearEsperaRequestDto): EsperaDto {
    const nueva: EsperaDto = {
      esperaId: generateUuid(),
      nombreCliente: data.nombreCliente,
      telefonoContacto: data.telefonoContacto,
      cantidadPersonas: data.cantidadPersonas,
      horaLlegada: new Date().toISOString(),
      estado: EstadoEspera.EN_ESPERA,
      idMesaAsignada: null,
    };
    this.espera.push(nueva);
    return clone(nueva);
  }

  actualizarEstadoEspera(esperaId: string, nuevoEstado: EstadoEspera): EsperaDto {
    const item = this.espera.find((e) => e.esperaId === esperaId);
    if (!item) {
      throw new MockApiError(
        404,
        'ESPERA_NO_ENCONTRADA',
        `Entrada de espera ${esperaId} no encontrada`,
      );
    }

    if (item.estado === EstadoEspera.SENTADO || item.estado === EstadoEspera.CANCELADO) {
      throw new MockApiError(
        409,
        'TRANSICION_INVALIDA',
        'No se permiten transiciones desde Sentado o Cancelado',
      );
    }

    item.estado = nuevoEstado;
    return clone(item);
  }
}

export const mockDb = new MockDatabase();
