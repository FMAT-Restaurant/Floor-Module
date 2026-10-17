import { PrismaClient } from '@prisma/client';

/**
 * BE-001 · La hora de las reservas sigue la zona horaria del sistema (sesión de PostgreSQL).
 * La prueba fija la zona dentro de una transacción, así que no depende de cómo esté
 * configurado el servidor (docker, CI o producción).
 * Requiere PostgreSQL con todas las migraciones aplicadas y DATABASE_URL definida.
 */
const prisma = new PrismaClient();

interface RangoReserva {
  inicio: Date;
  fin: Date;
}

async function rangoEnZona(zona: string): Promise<RangoReserva> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('TimeZone', ${zona}, true)`;
    const mesa = await tx.mesa.create({
      data: { numeroMesa: 1, capacidad: 4, zona: 'Principal' },
    });
    await tx.$executeRaw`
      INSERT INTO "Reserva"
        ("id_mesa","nombre_contacto","telefono_contacto","cantidad_personas",
         "fecha_reserva","hora_inicio","hora_fin","estado")
      VALUES
        (${mesa.id}::uuid, 'Ana Pérez', '5512345678', 2,
         '2030-01-15'::date, '19:00'::time, '21:00'::time, 'Confirmada'::"EstadoReserva")`;
    const [rango] = await tx.$queryRaw<RangoReserva[]>`
      SELECT lower("rango") AS inicio, upper("rango") AS fin FROM "Reserva"`;
    return rango;
  });
}

describe('Zona horaria de las reservas (BE-001)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Reserva","Mesa" CASCADE');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('con zona UTC, las 19:00 se guardan como 19:00Z', async () => {
    const rango = await rangoEnZona('UTC');

    expect(rango.inicio.toISOString()).toBe('2030-01-15T19:00:00.000Z');
    expect(rango.fin.toISOString()).toBe('2030-01-15T21:00:00.000Z');
  });

  it('con zona America/Mexico_City, las 19:00 se guardan como 01:00Z del día siguiente', async () => {
    const rango = await rangoEnZona('America/Mexico_City');

    expect(rango.inicio.toISOString()).toBe('2030-01-16T01:00:00.000Z');
    expect(rango.fin.toISOString()).toBe('2030-01-16T03:00:00.000Z');
  });
});
