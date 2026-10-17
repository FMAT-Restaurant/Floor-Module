-- BE-001 · La zona horaria de las reservas pasa a ser la del sistema.
--
-- Hasta ahora el trigger interpretaba fecha_reserva + hora_inicio/hora_fin como UTC.
-- Ahora usa la zona horaria de la sesión de PostgreSQL (parámetro `TimeZone`):
-- el cast de `timestamp` a `timestamptz` aplica esa zona.
--
-- Efecto: lo que decida el servidor de BD (docker, CI, producción) es la zona del restaurante.
-- Si el servidor está en UTC, el comportamiento es idéntico al anterior.
--
-- No se recalculan filas existentes porque aún no se crean reservas (BE-007).
CREATE OR REPLACE FUNCTION reserva_calcular_rango() RETURNS trigger AS $$
BEGIN
  IF NEW."hora_fin" > NEW."hora_inicio" THEN
    NEW."rango" := tstzrange(
      (NEW."fecha_reserva" + NEW."hora_inicio")::timestamptz,
      (NEW."fecha_reserva" + NEW."hora_fin")::timestamptz,
      '[)'
    );
  ELSE
    NEW."rango" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
