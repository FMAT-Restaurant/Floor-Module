# REQUIREMENTS — Microservicio Sala y Reservas (Floor-Module)

> **Qué debe hacer el sistema y bajo qué condiciones.**
> Fuentes: [`docs/Microservicio_Sala_Reservas.md`](../docs/Microservicio_Sala_Reservas.md), [`docs/adr/ADR-001-stack-y-monorepo.md`](../docs/adr/ADR-001-stack-y-monorepo.md), [`docs/guia-visual-componentes.md`](../docs/guia-visual-componentes.md).
> Comportamiento detallado en [SPEC.md](./SPEC.md); construcción en [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> **Decisiones confirmadas por el equipo:** Ver §10 para el registro de preguntas resueltas (normalización a 409, `cantidad_personas` en reservas, estado `No-show`, unión por misma zona, advertencias de sobrecupo y reserva próxima, Prisma + RabbitMQ).

---

## 1. Contexto y objetivo

FMAT-Restaurant es un ecosistema POS de microservicios (Sala, Órdenes y Cocina, Cuenta y Pagos, Menú, Auth). **Sala y Reservas** es dueño de la operativa física del salón:

- Plano de mesas y su ciclo operativo (`Libre` → `Ocupada` → `Limpieza pendiente` → `Libre`).
- Asignación de meseros a mesas.
- Demanda entrante: reservas agendadas y lista de espera presencial.
- Unión temporal de mesas de la misma zona para grupos grandes.
- Disparo del inicio de servicio mediante el evento `sala.dining_session.iniciada` (con `sessionId` UUID v4 generado por Sala), sin poseer la sesión de consumo.

**Objetivo:** dar visibilidad en tiempo real del estado del salón al personal (meseros, hostess, capitanes, limpieza), evitar dobles reservas y conflictos de ocupación, y habilitar a Cocina y Pagos para iniciar sus contextos en cuanto una mesa se ocupa, manteniendo un acoplamiento mínimo con el resto del ecosistema.

## 2. Stakeholders

| Stakeholder | Rol / Interés |
|---|---|
| Mesero | Ocupa mesas, es asignado como responsable, consulta el plano en vivo. |
| Capitán de sala | Ocupa mesas, une/libera mesas, reasigna meseros, balancea carga. |
| Hostess / Recepción | Gestiona reservas, lista de espera y uniones; recibe alertas de reserva próxima y de mesa disponible. |
| Personal de limpieza | Marca mesas como `Libre` al terminar la limpieza. |
| Administrador del restaurante | Mantiene el plano de mesas (CRUD, zonas, capacidad). |
| Equipo Órdenes y Cocina | Consume `sala.dining_session.iniciada` para habilitar comandas. |
| Equipo Cuenta y Pagos | Consume `sala.dining_session.iniciada` para inicializar la cuenta local. |
| Equipo Auth / API Gateway | Emite y valida JWT; propaga identidad y rol a Sala. |
| Equipo de Sala (desarrollo) | Construye y opera el microservicio. |
| Equipo de Arquitectura | Vela por límites de dominio y consistencia con el ecosistema. |

## 3. Alcance

### 3.1 Incluido
- CRUD de mesas con baja lógica (número, capacidad, zona).
- Gestión del estado físico en tiempo real e indicador de reserva próxima (ventana base de 30 min, configurable).
- Publicación de eventos `sala.dining_session.iniciada`, `sala.mesa.estado_actualizado`, `sala.reserva.proxima_alerta`.
- Asignación y reasignación de meseros por mesa.
- Reservas: creación (con `cantidad_personas`), reprogramación, cancelación, marcado como `Completada` y `No-show`, y consulta de disponibilidad.
- Unión y disolución atómica de mesas dentro de la misma zona.
- Lista de espera presencial y notificación a recepción cuando una mesa compatible queda libre.
- Frontend SPA del módulo (vistas Plano de Sala, Reservas, Espera) conforme a la guía visual.
- Notificación en tiempo real a frontends vía WebSocket.

### 3.2 Excluido explícitamente
- Persistir o gestionar el ciclo de vida de `DiningSession` (pertenece a Órdenes y Cocina / Cuenta y Pagos).
- Comandas, platillos, modificadores, tiempos KDS.
- Menú, catálogo o precios (cero acoplamiento con Menú).
- Pagos, facturación, arqueos.
- Liberar mesas automáticamente por `PagoCompletado` o cierre de comanda.
- Autenticación, gestión de credenciales y contraseñas (pertenece a Auth / API Gateway).
- Navegación global, sidebar o topbar (pertenecen al Shell del ecosistema).
- Consumo de eventos de otros microservicios.
- **(Propuesto)** Reservas autogestionadas por el comensal final (portal público) y notificaciones SMS/email al comensal.

## 4. Requisitos funcionales

Prioridad MoSCoW: **M** = Must, **S** = Should, **C** = Could, **W** = Won't (esta versión).

### 4.1 Plano de mesas

| ID | Requisito | Prioridad |
|---|---|---|
| RF-001 | Registrar una mesa con número único, capacidad y zona. | M |
| RF-002 | Editar número, capacidad y zona de una mesa existente. | M |
| RF-003 | Dar de baja lógica una mesa (deja de aparecer en el plano operativo). | M |
| RF-004 | Consultar el estado en vivo del salón, incluyendo indicador `tieneReservaProxima` (ventana 30 min configurable). | M |

**RF-001** — Dado un administrador autenticado, Cuando registra una mesa con `numeroMesa` no usado por otra mesa activa, `capacidad ≥ 1` y `zona`, Entonces la mesa se crea en estado `Libre` y se responde 201 con su identificador.
— Dado un `numeroMesa` ya usado por una mesa activa, Cuando intenta registrarla, Entonces se responde 409 y no se crea nada.

**RF-002** — Dada una mesa existente, Cuando el administrador modifica sus atributos con valores válidos, Entonces se persisten y se responde 200 con la mesa actualizada.

**RF-003** — Dada una mesa `Libre` sin reservas `Confirmada` futuras, Cuando el administrador la da de baja, Entonces queda inactiva y deja de listarse en el estado en vivo.
— Dada una mesa `Ocupada`, en unión activa o con reservas futuras, Cuando se intenta dar de baja, Entonces se responde 409.

**RF-004** — Dada una mesa `Libre` con una reserva `Confirmada` que inicia dentro de la ventana de anticipación (30 min de base, configurable), Cuando un cliente consulta el estado en vivo, Entonces la mesa aparece con `estadoFisico: "Libre"` y `tieneReservaProxima: true`.

### 4.2 Ciclo operativo y Dining Session

| ID | Requisito | Prioridad |
|---|---|---|
| RF-005 | Ocupar una mesa `Libre` con comensales y mesero, y emitir `sala.dining_session.iniciada`. | M |
| RF-006 | Marcar una mesa `Ocupada` como `Limpieza pendiente` por confirmación del personal. | M |
| RF-007 | Marcar una mesa `Limpieza pendiente` como `Libre` al concluir la limpieza. | M |
| RF-008 | Publicar `sala.mesa.estado_actualizado` en cada transición de estado físico. | M |
| RF-009 | Notificar el cambio de estado a los frontends conectados en tiempo real. | M |

**RF-005** — Dada una mesa `Libre`, Cuando un mesero o capitán la ocupa con `comensales` y `meseroId`:
- Si la mesa tiene `tieneReservaProxima = true` (dentro de los 30 min de la reserva), se requiere advertencia / confirmación explícita (`forzarOcupacion: true`) para evitar sentar clientes en mesas ya reservadas.
- Si `comensales > capacidad`, se permite con advertencia / confirmación (`forzarSobrecupo: true`).
- Entonces la mesa pasa a `Ocupada`, se genera un `sessionId` (UUID v4), se responde 200 con `{mesaId, estado: "Ocupada", sessionId}` y se publican `sala.dining_session.iniciada` y `sala.mesa.estado_actualizado`.
— Dada una mesa `Ocupada` o `Limpieza pendiente`, Cuando se intenta ocupar, Entonces se responde 409 `"Mesa no disponible"` y no se publica ningún evento.

**RF-006** — Dada una mesa `Ocupada`, Cuando el personal confirma la salida de los comensales, Entonces pasa a `Limpieza pendiente` y se publica `sala.mesa.estado_actualizado`.
— Dado que Pagos publica `PagoCompletado`, Cuando Sala está en ejecución, Entonces el estado de la mesa **no** cambia.

**RF-007** — Dada una mesa `Limpieza pendiente`, Cuando el personal la marca `Libre`, Entonces se responde 200, se publica `sala.mesa.estado_actualizado` y se evalúa la lista de espera (RF-020).

**RF-008** — Dada cualquier transición de estado físico confirmada, Cuando la transacción se confirma, Entonces se publica exactamente un evento lógico `sala.mesa.estado_actualizado` con el nuevo estado.

**RF-009** — Dado un frontend suscrito al canal en vivo, Cuando cambia el estado de una mesa, Entonces el frontend recibe la actualización sin necesidad de recargar ni hacer polling.

### 4.3 Meseros

| ID | Requisito | Prioridad |
|---|---|---|
| RF-010 | Asignar un mesero responsable a una mesa. | M |
| RF-011 | Reasignar el mesero de una mesa (cambio de turno / balanceo). | S |

**RF-010** — Dada una mesa sin asignación activa, Cuando se asigna `meseroId`, Entonces se crea una asignación activa con `fechaHoraInicio` = ahora.

**RF-011** — Dada una mesa con asignación activa, Cuando se asigna otro mesero, Entonces la asignación previa se cierra (`activo=false`, `fechaHoraFin`=ahora) y se crea la nueva en la misma operación atómica.

### 4.4 Reservas

| ID | Requisito | Prioridad |
|---|---|---|
| RF-012 | Crear una reserva para mesa, fecha, hora de inicio, duración, cantidad de personas y contacto. | M |
| RF-013 | Reprogramar una reserva confirmada (fecha, hora, duración, personas o mesa). | S |
| RF-014 | Cancelar una reserva confirmada. | M |
| RF-015 | Consultar disponibilidad de mesas por fecha, franja horaria y número de personas. | S |
| RF-016 | Emitir alerta de reserva próxima a recepción dentro de la ventana de anticipación (30 min base configurable). | S |
| RF-017 | Marcar la reserva como `Completada` al sentar a sus comensales. | S |
| RF-017b| Marcar la reserva como `No-show` si expira la tolerancia tras la hora de inicio. | S |

**RF-012** — Dada una mesa sin reservas `Confirmada` que se solapen con la franja solicitada y `cantidad_personas ≤ capacidad`, Cuando recepción registra la reserva, Entonces se responde 201 con `{reservaId, mesaId, estado: "Confirmada"}`.
— Dada una reserva `Confirmada` que se solapa en la misma mesa, Cuando se intenta registrar, Entonces se responde 409 `"Mesa reservada en ese horario"`.
— Dadas dos solicitudes concurrentes solapadas para la misma mesa, Cuando se procesan, Entonces exactamente una se confirma (garantizado por `EXCLUDE` en Postgres).

**RF-013** — Dada una reserva `Confirmada`, Cuando se reprograma a una franja libre, Entonces se actualiza conservando su `reservaId`; si la nueva franja se solapa, se responde 409 y la reserva original queda intacta.

**RF-014** — Dada una reserva `Confirmada`, Cuando se cancela, Entonces pasa a `Cancelada` y su franja queda disponible. Dada una reserva no `Confirmada`, Cuando se intenta cancelar, Entonces se responde 409.

**RF-015** — Dados fecha, hora, duración y personas, Cuando se consulta disponibilidad, Entonces se devuelven solo mesas activas con capacidad suficiente y sin reservas `Confirmada` solapadas.

**RF-016** — Dada una reserva `Confirmada` cuya hora de inicio entra en la ventana configurada (30 min base), Cuando el proceso de alertas se ejecuta, Entonces se publica una única vez `sala.reserva.proxima_alerta` y se notifica a recepción.

**RF-017** — Dada una reserva `Confirmada` para una mesa, Cuando se ocupa la mesa indicando `reservaId`, Entonces la reserva pasa a `Completada`.

**RF-017b** — Dada una reserva `Confirmada` donde han transcurrido más de X minutos de tolerancia (ej. 15 min configurable) desde `hora_inicio` sin ser ocupada, Cuando recepción o el sistema la procesa, Entonces pasa a `No-show` liberando la mesa.

### 4.5 Uniones de mesas

| ID | Requisito | Prioridad |
|---|---|---|
| RF-018 | Unir dos o más mesas libres de la misma zona para un grupo y ocuparlas como una sola sesión. | S |
| RF-019 | Liberar una unión: disolverla atómicamente y pasar sus mesas a `Limpieza pendiente`. | S |

**RF-018** — Dadas ≥ 2 mesas `Libre`, no unidas y pertenecientes a la **misma zona**, Cuando el capitán crea la unión con `totalPersonas` y `meseroId`:
- Si alguna mesa tiene reserva próxima dentro de la ventana de 30 min, se solicita advertencia / confirmación explícita.
- Si todas están libres y en la misma zona, se crea la unión `Activa`, todas pasan a `Ocupada`, se genera un `sessionId` (UUID v4), se responde 201 con `{unionId, mesasIds, estado: "Ocupada", sessionId}` y se publican `sala.dining_session.iniciada` y `sala.mesa.estado_actualizado`.
— Si al menos una mesa no está `Libre`, está en otra unión, o **pertenece a una zona distinta**, Cuando se intenta unir, Entonces se responde **409 Conflict** (normalizado) sin modificar ninguna mesa.

**RF-019** — Dada una unión `Activa`, Cuando se libera, Entonces la unión pasa a `Disuelta`, cada mesa queda sin `idUnionMesa` y en `Limpieza pendiente`, se responde 200 y se publica `sala.mesa.estado_actualizado` con `unionId: null`.

### 4.6 Lista de espera

| ID | Requisito | Prioridad |
|---|---|---|
| RF-020 | Notificar a recepción cuando una mesa liberada es compatible con un cliente en espera. | S |
| RF-021 | Registrar un cliente en lista de espera (nombre, teléfono, personas). | S |
| RF-022 | Actualizar el estado de una entrada de espera (`Sentado`, `Cancelado`). | S |

**RF-020** — Dada al menos una entrada `En espera` con `cantidadPersonas ≤ capacidad`, Cuando una mesa pasa a `Libre`, Entonces se notifica a recepción con `{mesaId, esperaId, cliente}` y la entrada pasa a `Notificado`.

**RF-021** — Dados nombre, teléfono y `cantidadPersonas ≥ 1`, Cuando recepción registra al cliente, Entonces se crea la entrada `En espera` con `horaLlegada` = ahora.

**RF-022** — Dada una entrada `En espera` o `Notificado`, Cuando recepción la marca `Sentado` o `Cancelado`, Entonces se actualiza; desde `Sentado` o `Cancelado` no se permiten más transiciones (409).

### 4.7 Interfaz de usuario

| ID | Requisito | Prioridad |
|---|---|---|
| RF-023 | Vista Plano de Sala con card por mesa (estado físico, capacidad, tiempo transcurrido, acción). Si está Libre + reserva próxima, muestra distintivo visual "Reservada" sin mutar el enum físico. | M |
| RF-024 | Vista Reservas (agenda, alta con personas, reprogramación, cancelación, No-show). | S |
| RF-025 | Vista Lista de Espera (alta, estado, notificaciones). | S |

**RF-023** — Dado el plano cargado, Cuando una mesa cambia de estado en el backend, Entonces su card se actualiza mostrando dot + texto de estado según la guía visual (§4.1 de la guía). Si la mesa está `Libre` pero `tieneReservaProxima = true`, muestra el badge azul ("Reservada" / "Reserva próxima") y solicita advertencia al intentar ocuparla.

## 5. Requisitos no funcionales

| ID | Categoría | Requisito | Métrica medible |
|---|---|---|---|
| RNF-001 | Rendimiento | Latencia de la API REST. | p95 ≤ 300 ms lecturas, p95 ≤ 500 ms escrituras, con 50 req/s sostenidas. |
| RNF-002 | Tiempo real | Propagación de cambios de estado a frontends conectados. | p95 ≤ 2 s desde commit hasta recepción en el cliente WebSocket; 0 polling periódico. |
| RNF-003 | Integridad | Sin dobles reservas en la misma mesa. | 0 reservas `Confirmada` solapadas, garantizado por restricción `EXCLUDE` de PostgreSQL (50 req simultáneas → 1 éxito). |
| RNF-004 | Integridad | Atomicidad en uniones y transiciones múltiples. | 0 estados parciales observables tras fallo inyectado a mitad de la operación. |
| RNF-005 | Confiabilidad | Entrega de eventos de integración. | At-least-once vía RabbitMQ; 0 eventos perdidos tras commit; publicación p95 ≤ 5 s post-commit; cada evento con ID único para deduplicación. |
| RNF-006 | Disponibilidad | Disponibilidad del servicio en horario operativo. | ≥ 99.5 % mensual medido por health check. |
| RNF-007 | Seguridad | Toda petición de negocio exige identidad validada por el API Gateway. | 100 % de endpoints de negocio responden 401/403 sin identidad/rol válido; 0 secretos en el repositorio. |
| RNF-008 | Límites | Tamaño de mensajes. | Request HTTP ≤ 64 KB (413 si excede); payload de evento ≤ 16 KB. |
| RNF-009 | Mantenibilidad | Contratos únicos front/back/eventos. | 100 % de enums, interfaces y payloads de eventos definidos en `@floor/shared`; CI falla ante desalineación de tipos. |
| RNF-010 | Usabilidad / Accesibilidad | Conformidad con la guía visual v2.0 (`guia-visual-componentes.md`). | Controles ≥ 40 px (≥ 44–48 px táctil); estados con color + texto; 3 breakpoints verificados (≥1200, 768–1199, <768 px); checklist §8 de la guía al 100 %. |
| RNF-011 | Observabilidad | Trazabilidad de operaciones y eventos. | 100 % de requests y eventos con `correlationId` en logs estructurados JSON; endpoint de health. |
| RNF-012 | Escalabilidad | Capacidad por restaurante. | ≥ 200 mesas y ≥ 100 conexiones WebSocket concurrentes sin degradar RNF-001/002. |
| RNF-013 | Calidad / CI | Pipeline de validación. | lint + build + test en CI < 10 min; cobertura ≥ 80 % en servicios de dominio. |
| RNF-014 | Desplegabilidad | Independencia de despliegue respecto a Cocina y Pagos. | Despliegue de Sala sin coordinar releases de otros servicios; sólo se reconstruye el artefacto afectado. |

## 6. Restricciones

- **Lenguaje:** TypeScript 5.x en todo el módulo (ADR-001).
- **Backend:** Node.js con NestJS. **Frontend:** React 18 + Vite + Tailwind CSS.
- **Base de datos:** PostgreSQL 16 (uso de `tstzrange` + `EXCLUDE` para reservas).
- **ORM Oficial:** **Prisma** (con soporte de extensiones y raw SQL para restricciones `EXCLUDE` de PostgreSQL).
- **Message Broker Oficial:** **RabbitMQ** (AMQP, preconfigurado en `docker-compose.yml`).
- **Tiempo real:** Socket.io (NestJS Gateway).
- **Repositorio:** monorepo pnpm 9 + Turborepo; Node 20 en CI.
- **UI:** Única fuente de verdad: [`docs/guia-visual-componentes.md`](../docs/guia-visual-componentes.md) (referencias a `mockups_sala.html` descartadas por ser errata).
- **Seguridad:** autenticación y roles vienen del API Gateway / Auth; Sala no valida credenciales.

## 7. Supuestos

- S-01: El API Gateway valida el JWT y entrega a Sala la identidad (`sub`) y rol del usuario.
- S-02: `id_mesero` corresponde al claim `sub` del JWT emitido por Auth (pendiente de confirmar formato exacto, Q2).
- S-03: Sala genera el `sessionId` (UUID v4) al emitir `sala.dining_session.iniciada` (confirmado por equipo).
- S-04: Un único restaurante (sin multi-tenant) por instancia del servicio.
- S-05: Una mesa tiene a lo sumo un mesero activo asignado a la vez.
- S-06: La zona horaria operativa es única por restaurante y conocida por el servicio.
- S-07: Órdenes y Cocina y Cuenta y Pagos son consumidores idempotentes de `sala.dining_session.iniciada`.

## 8. Riesgos

| ID | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R-01 | Pérdida o duplicación de eventos entre commit y publicación. | Cocina/Pagos sin sesión o duplicada. | Outbox transaccional + `eventId` (ADR-006 en ARCHITECTURE). |
| R-02 | Condiciones de carrera al ocupar/unir la misma mesa. | Doble ocupación. | Transacciones con bloqueo de fila / actualización condicional por estado. |
| R-03 | Ocupación accidental de mesas con reserva entrante. | Conflicto con clientes agendados. | Advertencia/confirmación obligatoria en API/UI si falta ≤ 30 min (RF-005). |
| R-04 | Sobrecupo en salón. | Problemas de aforo y servicio. | Advertencia/confirmación al registrar comensales > capacidad (RF-005). |
| R-05 | Lint y tests actualmente son placeholders (`echo`). | Regresiones no detectadas. | Configurar ESLint/Prettier/Jest/Vitest (deuda técnica en ARCHITECTURE). |
| R-06 | Desfase horario en reservas. | Alertas o solapamientos erróneos. | Almacenar en `timestamptz` y convertir en bordes. |

## 9. Glosario

| Término | Definición |
|---|---|
| Mesa | Unidad física del salón con número, capacidad y zona. |
| Estado físico | `Libre`, `Ocupada`, `Limpieza pendiente` (enum de backend `EstadoMesa`). |
| Reserva próxima | Indicador derivado (no es un estado físico) cuando una reserva `Confirmada` inicia dentro de la ventana de anticipación (30 min base configurable). En UI se muestra con distintivo azul "Reservada". |
| Unión de mesas | Agrupación lógica temporal de ≥ 2 mesas de la **misma zona** para un grupo; se disuelve al liberarse. |
| Lista de espera | Fila presencial de comensales sin reserva. |
| Dining Session | Sesión de consumo; **no** pertenece a Sala. Sala sólo genera su `sessionId` (UUID v4) y emite el evento inicial. |
| `sessionId` | UUID v4 generado por Sala al ocupar mesa o crear unión, compartido por Cocina y Pagos como correlación. |
| No-show | Estado de reserva cuando el cliente no se presenta tras el tiempo de tolerancia posterior a la `hora_inicio`. |
| Ventana de anticipación | Minutos antes de `hora_inicio` en que se activa el indicador/alerta de reserva próxima (30 min base). |
| API Gateway | Punto de entrada que valida JWT y enruta a Sala. |
| Broker | Message broker RabbitMQ para eventos de integración. |
| Shell | Contenedor frontend global que aloja navegación y autenticación. |

## 10. Registro de decisiones y preguntas abiertas

### 10.1 Decisiones resueltas con el equipo

| ID | Tema | Decisión tomada |
|---|---|---|
| Q1 | `sessionId` Dining Session | **Sala genera el UUID v4** al emitir `sala.dining_session.iniciada`. |
| Q3 / Q9 | Ventana de Reserva Próxima | **30 minutos de base**, configurable mediante variable de entorno (`RESERVA_PROXIMA_VENTANA_MINUTOS`). |
| Q5 | Sobrecupo (`comensales > capacidad`) | **Permitido con advertencia / confirmación explícita** en API (`forzarSobrecupo: true`) y UI. |
| Q6 | Personas en `Reserva` | **Agregado formalmente** `cantidad_personas: number` a `Reserva` en `@floor/shared` y modelo. |
| Q7 | Contigüidad en uniones | **Validar que pertenezcan a la misma zona** (`zona`). |
| Q8 | Código HTTP al fallar unión | **Normalizado a 409 Conflict** (para mesas no libres, ya unidas o zona incompatible). |
| Q9 | Reservas vencidas | **Agregado estado `No-show`** (`EstadoReserva.NO_SHOW`) al enum e interfaces. |
| Q10 | Ocupar mesa con reserva próxima | **Permitido pero con advertencia / confirmación explícita** (`forzarOcupacion: true`) dentro de la ventana de 30 min. |
| Q11 | ORM y Message Broker | **Prisma** (ORM) y **RabbitMQ** (Broker). Drizzle y Redis Streams quedan descartados. |
| Q12 | `mockups_sala.html` | Descartado (errata en docs). La única referencia UI es [`docs/guia-visual-componentes.md`](../docs/guia-visual-componentes.md). |
| Q13 | Estado visual "Reservada" | **Opción A:** El enum físico sigue siendo `Libre`, `Ocupada`, `Limpieza pendiente`. En frontend, `Libre` con `tieneReservaProxima = true` renderiza badge azul ("Reservada") para guiar al usuario. |

### 10.2 Preguntas abiertas pendientes

| ID | Pregunta | Afecta |
|---|---|---|
| Q2 | ¿`id_mesero` en `AsignacionMesero` es UUID o string derivado del claim `sub` del JWT? | RF-010, RF-011 |
| Q4 | Contrato exacto de cabeceras de identidad propagadas por el API Gateway (ej. `x-user-id`, `x-user-roles`) y matriz final de roles con el equipo de Auth. | RNF-007 |
