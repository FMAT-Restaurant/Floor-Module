-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('Libre', 'Ocupada', 'Limpieza pendiente');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('Confirmada', 'Cancelada', 'Completada', 'No-show');

-- CreateEnum
CREATE TYPE "EstadoEspera" AS ENUM ('En espera', 'Notificado', 'Sentado', 'Cancelado');

-- CreateEnum
CREATE TYPE "EstadoUnion" AS ENUM ('Activa', 'Disuelta');

-- CreateTable
CREATE TABLE "UnionMesa" (
    "id_union" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zona" VARCHAR(50) NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_disolucion" TIMESTAMPTZ(6),
    "estado" "EstadoUnion" NOT NULL DEFAULT 'Activa',

    CONSTRAINT "UnionMesa_pkey" PRIMARY KEY ("id_union")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id_mesa" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero_mesa" INTEGER NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "zona" VARCHAR(50) NOT NULL,
    "estado_fisico" "EstadoMesa" NOT NULL DEFAULT 'Libre',
    "id_union_mesa" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ocupada_desde" TIMESTAMPTZ(6),

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id_mesa")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id_reserva" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_mesa" UUID NOT NULL,
    "nombre_contacto" VARCHAR(120) NOT NULL,
    "telefono_contacto" VARCHAR(20) NOT NULL,
    "cantidad_personas" INTEGER NOT NULL,
    "fecha_reserva" DATE NOT NULL,
    "hora_inicio" TIME(6) NOT NULL,
    "hora_fin" TIME(6) NOT NULL,
    "rango" tstzrange,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'Confirmada',
    "alerta_emitida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id_reserva")
);

-- CreateTable
CREATE TABLE "AsignacionMesero" (
    "id_asignacion" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_mesa" UUID NOT NULL,
    "id_mesero" UUID NOT NULL,
    "fecha_hora_inicio" TIMESTAMPTZ(6) NOT NULL,
    "fecha_hora_fin" TIMESTAMPTZ(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AsignacionMesero_pkey" PRIMARY KEY ("id_asignacion")
);

-- CreateTable
CREATE TABLE "ListaEspera" (
    "id_espera" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre_cliente" VARCHAR(120) NOT NULL,
    "telefono_contacto" VARCHAR(20) NOT NULL,
    "cantidad_personas" INTEGER NOT NULL,
    "hora_llegada" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoEspera" NOT NULL DEFAULT 'En espera',
    "id_mesa_asignada" UUID,

    CONSTRAINT "ListaEspera_pkey" PRIMARY KEY ("id_espera")
);

-- CreateTable
CREATE TABLE "outbox_evento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routing_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_en" TIMESTAMPTZ(6),
    "intentos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mesa_id_union_mesa_idx" ON "Mesa"("id_union_mesa");

-- CreateIndex
CREATE INDEX "Mesa_zona_estado_fisico_idx" ON "Mesa"("zona", "estado_fisico");

-- CreateIndex
CREATE INDEX "Reserva_id_mesa_fecha_reserva_idx" ON "Reserva"("id_mesa", "fecha_reserva");

-- CreateIndex
CREATE INDEX "Reserva_estado_fecha_reserva_idx" ON "Reserva"("estado", "fecha_reserva");

-- CreateIndex
CREATE INDEX "AsignacionMesero_id_mesero_activo_idx" ON "AsignacionMesero"("id_mesero", "activo");

-- CreateIndex
CREATE INDEX "ListaEspera_estado_hora_llegada_idx" ON "ListaEspera"("estado", "hora_llegada");

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_id_union_mesa_fkey" FOREIGN KEY ("id_union_mesa") REFERENCES "UnionMesa"("id_union") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_id_mesa_fkey" FOREIGN KEY ("id_mesa") REFERENCES "Mesa"("id_mesa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionMesero" ADD CONSTRAINT "AsignacionMesero_id_mesa_fkey" FOREIGN KEY ("id_mesa") REFERENCES "Mesa"("id_mesa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_id_mesa_asignada_fkey" FOREIGN KEY ("id_mesa_asignada") REFERENCES "Mesa"("id_mesa") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SH-004 · SQL crudo que se PEGA AL FINAL de la migración inicial generada
-- por Prisma (apps/api/prisma/migrations/<fecha>_init/migration.sql).
-- Lo que Prisma no sabe expresar: extensión, columna generada, EXCLUDE,
-- índices únicos parciales y CHECKs. (SPEC §2, ARCHITECTURE §7, ADR-002)
-- ============================================================================

-- 1) Extensión necesaria para mezclar "=" (uuid) y "&&" (rango) en un EXCLUDE gist.
--    Es una extensión "trusted" en PG13+: no requiere superusuario.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2) `rango` se calcula con un TRIGGER (no como columna generada: Prisma no entiende las
--    generadas y pediría una migración extra cada vez). Rango semiabierto [inicio, fin),
--    siempre consistente con fecha_reserva + hora_inicio/hora_fin, interpretado en UTC.
--    Si hora_fin <= hora_inicio se deja en NULL para que falle el CHECK reserva_horas_chk
--    con un error claro. La columna `rango` ya la creó Prisma: aquí NO se vuelve a crear.
CREATE OR REPLACE FUNCTION reserva_calcular_rango() RETURNS trigger AS $$
BEGIN
  IF NEW."hora_fin" > NEW."hora_inicio" THEN
    NEW."rango" := tstzrange(
      (NEW."fecha_reserva" + NEW."hora_inicio") AT TIME ZONE 'UTC',
      (NEW."fecha_reserva" + NEW."hora_fin")    AT TIME ZONE 'UTC',
      '[)'
    );
  ELSE
    NEW."rango" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reserva_calcular_rango_trg"
  BEFORE INSERT OR UPDATE ON "Reserva"
  FOR EACH ROW EXECUTE FUNCTION reserva_calcular_rango();

-- 3) RNF-003 / ADR-002: no solapamiento de reservas Confirmadas por mesa, en el motor.
ALTER TABLE "Reserva" ADD CONSTRAINT "reserva_no_solapada_excl"
  EXCLUDE USING gist ("id_mesa" WITH =, "rango" WITH &&)
  WHERE ("estado" = 'Confirmada');

-- 4) Índices únicos parciales (ARCHITECTURE §7).
CREATE UNIQUE INDEX "mesa_numero_activo_uidx"
  ON "Mesa" ("numero_mesa") WHERE "activo" = true;

CREATE UNIQUE INDEX "asignacion_mesa_activa_uidx"
  ON "AsignacionMesero" ("id_mesa") WHERE "activo" = true;

-- 5) Índice parcial para que el relay del outbox lea sólo lo pendiente (BE-004).
CREATE INDEX "outbox_pendientes_idx"
  ON "outbox_evento" ("creado_en") WHERE "publicado_en" IS NULL;

-- 6) CHECKs de dominio (SPEC §2).
ALTER TABLE "Mesa"
  ADD CONSTRAINT "mesa_numero_pos_chk"    CHECK ("numero_mesa" > 0),
  ADD CONSTRAINT "mesa_capacidad_chk"     CHECK ("capacidad" >= 1),
  ADD CONSTRAINT "mesa_zona_no_vacia_chk" CHECK (length(btrim("zona")) > 0);

ALTER TABLE "Reserva"
  ADD CONSTRAINT "reserva_nombre_chk"    CHECK (length(btrim("nombre_contacto")) > 0),
  ADD CONSTRAINT "reserva_telefono_chk"  CHECK ("telefono_contacto" ~ '^[0-9 +()-]{7,20}$'),
  ADD CONSTRAINT "reserva_personas_chk"  CHECK ("cantidad_personas" >= 1),
  ADD CONSTRAINT "reserva_horas_chk"     CHECK ("hora_fin" > "hora_inicio");

ALTER TABLE "AsignacionMesero"
  ADD CONSTRAINT "asignacion_fechas_chk"
  CHECK ("fecha_hora_fin" IS NULL OR "fecha_hora_fin" > "fecha_hora_inicio");

ALTER TABLE "ListaEspera"
  ADD CONSTRAINT "espera_nombre_chk"   CHECK (length(btrim("nombre_cliente")) > 0),
  ADD CONSTRAINT "espera_telefono_chk" CHECK ("telefono_contacto" ~ '^[0-9 +()-]{7,20}$'),
  ADD CONSTRAINT "espera_personas_chk" CHECK ("cantidad_personas" >= 1);
