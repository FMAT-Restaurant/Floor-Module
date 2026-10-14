import { PrismaClient } from '@prisma/client';

/**
 * SH-004 · Verifica que las reglas de integridad viven en el MOTOR de BD
 * (RNF-003, ADR-002, ARCHITECTURE §7), no sólo en código de aplicación.
 * Requiere PostgreSQL 16 con la migración inicial aplicada y DATABASE_URL definida.
 */
const prisma = new PrismaClient();

const MESERO = '11111111-1111-4111-8111-111111111111';

async function crearMesa(numeroMesa: number, activo = true) {
  return prisma.mesa.create({
    data: { numeroMesa, capacidad: 4, zona: 'Terraza', activo },
  });
}

// Insert con SQL crudo para que el error del motor (código 23P01) llegue sin traducir.
function insertarReserva(
  mesaId: string,
  horaInicio: string,
  horaFin: string,
  estado: 'Confirmada' | 'Cancelada' = 'Confirmada',
) {
  return prisma.$executeRaw`
    INSERT INTO "Reserva"
      ("id_mesa","nombre_contacto","telefono_contacto","cantidad_personas",
       "fecha_reserva","hora_inicio","hora_fin","estado")
    VALUES
      (${mesaId}::uuid, 'Ana Pérez', '5512345678', 2,
       '2030-01-15'::date, ${horaInicio}::time, ${horaFin}::time,
       ${estado}::"EstadoReserva")`;
}

describe('Esquema de BD (SH-004)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Reserva","AsignacionMesero","ListaEspera","Mesa","UnionMesa","outbox_evento" CASCADE',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Reserva · EXCLUDE reserva_no_solapada_excl (RNF-003, ADR-002)', () => {
    it('rechaza una reserva Confirmada que se solapa en la misma mesa', async () => {
      const mesa = await crearMesa(1);
      await insertarReserva(mesa.id, '19:00', '21:00');

      await expect(insertarReserva(mesa.id, '20:00', '22:00')).rejects.toThrow(
        /23P01|reserva_no_solapada_excl/,
      );
    });

    it('permite reservas contiguas porque el rango es semiabierto [inicio, fin)', async () => {
      const mesa = await crearMesa(1);
      await insertarReserva(mesa.id, '19:00', '21:00');

      await expect(insertarReserva(mesa.id, '21:00', '23:00')).resolves.toBe(1);
    });

    it('permite el mismo horario en mesas distintas', async () => {
      const mesaA = await crearMesa(1);
      const mesaB = await crearMesa(2);
      await insertarReserva(mesaA.id, '19:00', '21:00');

      await expect(insertarReserva(mesaB.id, '19:00', '21:00')).resolves.toBe(1);
    });

    it('permite solapar sobre una reserva Cancelada (el EXCLUDE sólo aplica a Confirmada)', async () => {
      const mesa = await crearMesa(1);
      await insertarReserva(mesa.id, '19:00', '21:00', 'Cancelada');

      await expect(insertarReserva(mesa.id, '19:30', '20:30')).resolves.toBe(1);
    });

    it('rechaza hora_fin <= hora_inicio (CHECK reserva_horas_chk)', async () => {
      const mesa = await crearMesa(1);

      await expect(insertarReserva(mesa.id, '21:00', '19:00')).rejects.toThrow(
        /reserva_horas_chk|23514/,
      );
    });
  });

  describe('Mesa · índice único parcial y CHECKs', () => {
    it('rechaza numero_mesa duplicado entre mesas activas', async () => {
      await crearMesa(5);
      await expect(crearMesa(5)).rejects.toThrow();
    });

    it('permite reutilizar numero_mesa si la mesa anterior está dada de baja', async () => {
      await crearMesa(5, false);
      await expect(crearMesa(5)).resolves.toBeDefined();
    });

    it('rechaza capacidad menor a 1', async () => {
      await expect(
        prisma.mesa.create({ data: { numeroMesa: 9, capacidad: 0, zona: 'Salón' } }),
      ).rejects.toThrow();
    });
  });

  describe('AsignacionMesero · índice único parcial (id_mesa WHERE activo)', () => {
    it('rechaza dos asignaciones activas para la misma mesa', async () => {
      const mesa = await crearMesa(1);
      const datos = { mesaId: mesa.id, meseroId: MESERO, fechaHoraInicio: new Date() };
      await prisma.asignacionMesero.create({ data: datos });

      await expect(prisma.asignacionMesero.create({ data: datos })).rejects.toThrow();
    });

    it('permite una nueva activa cuando la anterior quedó inactiva', async () => {
      const mesa = await crearMesa(1);
      const datos = { mesaId: mesa.id, meseroId: MESERO, fechaHoraInicio: new Date() };
      await prisma.asignacionMesero.create({ data: { ...datos, activo: false } });

      await expect(prisma.asignacionMesero.create({ data: datos })).resolves.toBeDefined();
    });
  });
});
