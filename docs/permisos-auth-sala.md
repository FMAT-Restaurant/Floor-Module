# Catálogo de Permisos — Microservicio de Sala y Reservas (`sala`)

Listado de permisos requeridos por el módulo **Sala y Reservas** bajo el formato `modulo:recurso:accion` para su registro en el microservicio de **Auth**.

> **Notas técnicas:**
> - **Prefijo base de API:** `/api/v1/floor` (enrutado en Gateway; en desarrollo local y proxy Nginx también existe el alias `/sala`).
> - **Endpoints públicos (sin permisos requeridos):** `GET /health` y `GET /api/v1/floor/health`.
> - **Consumo en el servicio:** El microservicio ya recibe `x-user-permissions` (header de Kong) y el claim `permissions` en JWT HS256.

---

## 1. Mesas y Ciclo Operativo (`tables`)

### `sala:tables:view`
- **Etiqueta para UI:** Ver plano y mesas
- **Descripción:** Consultar el catálogo de mesas, su detalle individual y el estado operativo en tiempo real del plano de sala.
- **Endpoint / elemento UI que protege:**
  - `GET /api/v1/floor/mesas`
  - `GET /api/v1/floor/mesas/estado-en-vivo`
  - `GET /api/v1/floor/mesas/:mesaId`
  - WebSocket `/sala` (evento `mesa.estado_actualizado`)
  - UI: Pestaña `"Plano de sala"`, tarjetas de mesa (`MesaCard`), botón `"Ver mesa"` y vista de lectura de tabla en `"Configuración de mesas"`.

### `sala:tables:create`
- **Etiqueta para UI:** Crear mesas
- **Descripción:** Registrar nuevas mesas físicas definiendo número de mesa, capacidad y zona.
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/mesas`
  - UI: Botón `"Crear mesa"` en `"Configuración de mesas"` y envío del modal `"Crear mesa"`.

### `sala:tables:update`
- **Etiqueta para UI:** Editar mesas
- **Descripción:** Modificar número, capacidad o zona de una mesa física existente.
- **Endpoint / elemento UI que protege:**
  - `PATCH /api/v1/floor/mesas/:mesaId`
  - UI: Opción `"Editar mesa"` del menú de acciones de la tabla y botón `"Guardar cambios"` en el modal `"Editar Mesa"`.

### `sala:tables:delete`
- **Etiqueta para UI:** Dar de baja mesas
- **Descripción:** Realizar la baja lógica de una mesa física libre, sin unión activa ni reservas confirmadas futuras.
- **Endpoint / elemento UI que protege:**
  - `DELETE /api/v1/floor/mesas/:mesaId`
  - UI: Opción `"Dar de baja"` del menú de acciones de la tabla y botón `"Dar de baja mesa"` en el modal de confirmación.

### `sala:tables:occupy`
- **Etiqueta para UI:** Ocupar mesas
- **Descripción:** Sentar comensales en una mesa libre (walk-in, desde reserva o desde lista de espera, incluyendo autorización de sobrecupo o reserva próxima) e iniciar la sesión de consumo (`dining_session`).
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/mesas/:mesaId/ocupar`
  - UI: Modal `"Ocupar Mesa"` al seleccionar una mesa libre y botón `"Confirmar Ocupación"` (incluye checkboxes `"Autorizar sobrecupo para esta mesa"` y `"Ocupar de todos modos (tiempo de servicio limitado)"`).

### `sala:tables:update_status`
- **Etiqueta para UI:** Cambiar estado físico de mesas
- **Descripción:** Registrar la salida de comensales (`Ocupada` → `Limpieza pendiente`) y confirmar el fin de limpieza (`Limpieza pendiente` → `Libre`).
- **Endpoint / elemento UI que protege:**
  - `PATCH /api/v1/floor/mesas/:mesaId/estado`
  - UI: Botones `"Salida de comensales"` (y `"Confirmar salida"` en modal) y `"Marcar limpia"` en la tarjeta de mesa.

### `sala:tables:assign_waiter`
- **Etiqueta para UI:** Asignar mesero a mesa
- **Descripción:** Asignar o reasignar el mesero responsable de atender una mesa activa.
- **Endpoint / elemento UI que protege:**
  - `PUT /api/v1/floor/mesas/:mesaId/mesero`
  - UI: Botón `"Asignar mesero"` / `"Reasignar mesero"` y botón `"Guardar asignación"` en el modal de mesero responsable.

---

## 2. Asignaciones de Meseros (`assignments`)

### `sala:assignments:view`
- **Etiqueta para UI:** Ver asignaciones de meseros
- **Descripción:** Consultar las asignaciones activas e históricas de meseros a mesas.
- **Endpoint / elemento UI que protege:**
  - `GET /api/v1/floor/asignaciones`
  - UI: Consulta de asignaciones activas/históricas de meseros (actualmente visible de forma indirecta en `MesaCard`).

---

## 3. Uniones de Mesas (`table_unions`)

### `sala:table_unions:view`
- **Etiqueta para UI:** Ver uniones de mesas
- **Descripción:** Consultar las uniones activas o disueltas entre mesas de una misma zona.
- **Endpoint / elemento UI que protege:**
  - `GET /api/v1/floor/mesas/uniones`
  - UI: Distintivo de mesas unidas dentro de `MesaCard` en `"Plano de sala"`.

### `sala:table_unions:create`
- **Etiqueta para UI:** Unir mesas
- **Descripción:** Agrupar dos o más mesas libres de la misma zona para grupos grandes e iniciar una sesión de consumo compartida.
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/mesas/uniones`
  - UI: Botón `"Unir mesas"` en `"Plano de sala"`, panel inferior `"Unir mesas"` y botones `"Unir mesas"` / `"Unir de todos modos"`.

### `sala:table_unions:release`
- **Etiqueta para UI:** Liberar uniones de mesas
- **Descripción:** Disolver atómicamente una unión activa pasando todas las mesas involucradas a `Limpieza pendiente`.
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/mesas/uniones/:unionId/liberar`
  - UI: Botón `"Liberar unión"` en `MesaCard` y botón `"Confirmar liberación"` en el modal `"Liberar unión de mesas"`.

---

## 4. Reservas (`reservations`)

### `sala:reservations:view`
- **Etiqueta para UI:** Ver reservas y disponibilidad
- **Descripción:** Consultar la agenda de reservas, su detalle y buscar mesas disponibles por fecha, horario, duración y número de personas.
- **Endpoint / elemento UI que protege:**
  - `GET /api/v1/floor/reservas`
  - `GET /api/v1/floor/reservas/disponibilidad`
  - `GET /api/v1/floor/reservas/:reservaId`
  - WebSocket `/sala` (evento `reserva.proxima_alerta`)
  - UI: Pestaña `"Reservas"`, botón `"Buscar disponibilidad"`, tabla `"Agenda de reservas"`, selector `"Reserva asociada (opcional)"` al ocupar mesa y validación previa al dar de baja una mesa.

### `sala:reservations:create`
- **Etiqueta para UI:** Crear reservas
- **Descripción:** Registrar una nueva reservación confirmada para una mesa, fecha, horario y datos de contacto del cliente.
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/reservas`
  - UI: Botón `"Seleccionar Mesa ..."` en los resultados de disponibilidad y botón `"Crear reserva"` en el formulario de reserva.

### `sala:reservations:update`
- **Etiqueta para UI:** Reprogramar reservas
- **Descripción:** Modificar mesa, fecha, hora de inicio, duración o cantidad de personas de una reserva confirmada.
- **Endpoint / elemento UI que protege:**
  - `PATCH /api/v1/floor/reservas/:reservaId`
  - UI: Botón `"Reprogramar reserva"` en la agenda y botón `"Guardar cambios"` en el formulario de reserva.

### `sala:reservations:cancel`
- **Etiqueta para UI:** Cancelar reservas
- **Descripción:** Cancelar una reserva confirmada para liberar su franja horaria.
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/reservas/:reservaId/cancelar`
  - `DELETE /api/v1/floor/reservas/:reservaId`
  - UI: Botón `"Cancelar reserva"` en la agenda y botón de confirmación `"Cancelar reserva"` en el modal de confirmación.

### `sala:reservations:mark_no_show`
- **Etiqueta para UI:** Registrar No-show
- **Descripción:** Marcar una reserva confirmada como `No-show` tras expirar la tolerancia de llegada del cliente.
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/reservas/:reservaId/no-show`
  - UI: Botón `"Registrar No-show"` en la agenda y botón de confirmación `"Registrar No-show"` en el modal de confirmación.

---

## 5. Lista de Espera (`waitlist_entries`)

### `sala:waitlist_entries:view`
- **Etiqueta para UI:** Ver lista de espera
- **Descripción:** Consultar la fila presencial de clientes en espera en orden FIFO y recibir alertas cuando haya una mesa compatible disponible.
- **Endpoint / elemento UI que protege:**
  - `GET /api/v1/floor/espera`
  - WebSocket `/sala` (evento `espera.mesa_disponible`)
  - UI: Pestaña `"Lista de espera"`, tabla `"Cola de lista de espera"` y selector `"Turno en lista de espera (opcional)"` al ocupar mesa.

### `sala:waitlist_entries:create`
- **Etiqueta para UI:** Registrar en lista de espera
- **Descripción:** Agregar comensales sin reserva a la fila presencial indicando nombre, teléfono y cantidad de personas.
- **Endpoint / elemento UI que protege:**
  - `POST /api/v1/floor/espera`
  - UI: Formulario `"Agregar cliente a la fila presencial"` y botón `"Registrar en espera"`.

### `sala:waitlist_entries:update_status`
- **Etiqueta para UI:** Gestionar turnos en espera
- **Descripción:** Cambiar el estado de un registro en espera (`Sentado`, `Cancelado` o regresar a `En espera` desde `Notificado`).
- **Endpoint / elemento UI que protege:**
  - `PATCH /api/v1/floor/espera/:esperaId/estado`
  - UI: Botones `"Sentar cliente"`, `"Volver a espera"`, `"Cancelar espera"` en la tabla y botón `"Asignar mesa"` en el banner de alerta en tiempo real.

---

## Matriz sugerida por rol (referencia actual del módulo)

| Permiso | `ADMINISTRADOR` | `HOST` | `ROL_CAPITAN` | `MESERO` |
|---|:---:|:---:|:---:|:---:|
| `sala:tables:view` | ✔ | ✔ | ✔ | ✔ |
| `sala:tables:create` | ✔ | | | |
| `sala:tables:update` | ✔ | | | |
| `sala:tables:delete` | ✔ | | | |
| `sala:tables:occupy` | ✔ | ✔ | ✔ | ✔ |
| `sala:tables:update_status` | ✔ | ✔ | ✔ | ✔ |
| `sala:tables:assign_waiter` | ✔ | ✔ | ✔ | |
| `sala:assignments:view` | ✔ | ✔ | ✔ | ✔ |
| `sala:table_unions:view` | ✔ | ✔ | ✔ | ✔ |
| `sala:table_unions:create` | ✔ | ✔ | ✔ | |
| `sala:table_unions:release` | ✔ | ✔ | ✔ | |
| `sala:reservations:view` | ✔ | ✔ | ✔ | ✔ |
| `sala:reservations:create` | ✔ | ✔ | ✔ | |
| `sala:reservations:update` | ✔ | ✔ | ✔ | |
| `sala:reservations:cancel` | ✔ | ✔ | ✔ | |
| `sala:reservations:mark_no_show` | ✔ | ✔ | ✔ | |
| `sala:waitlist_entries:view` | ✔ | ✔ | ✔ | ✔ |
| `sala:waitlist_entries:create` | ✔ | ✔ | ✔ | |
| `sala:waitlist_entries:update_status` | ✔ | ✔ | ✔ | |
