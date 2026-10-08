# Plan de Tareas de Implementacion: Floor-Module (Sala y Reservas)

Desglose de tareas tecnicas para la construccion del microservicio de Sala y Reservas, estructurado bajo enfoque contract-first para trabajo en paralelo entre Backend y Frontend.

---

## Fase 0: Tareas Compartidas (Contract-First e Infraestructura Base)

### SH-001: Configurar herramientas de calidad de codigo, formato y runners de prueba
Configurar ESLint, Prettier, Jest y Vitest en la raiz del monorepo y en los paquetes apps/api, apps/web y packages/shared. Reemplazar los comandos temporales echo por ejecuciones reales que validen tipos, estilo y pruebas unitarias en el pipeline de CI.
- Requisitos: RNF-013, AGENTS.md (DT-01)
- Dependencias: Ninguna
- Criterios de aceptacion:
  - Ejecutar pnpm lint valida el codigo sin errores y reporta advertencias reales.
  - Ejecutar pnpm test corre las suites de Jest en API y Vitest en Web.
  - El pipeline .github/workflows/ci.yml completa exitosamente con las nuevas herramientas.
- Pruebas requeridas: Pruebas unitarias muestra en cada paquete para validar el funcionamiento del runner.
- Estimacion: 1 dia
- Perfil: DevOps / Fullstack

### SH-002: Implementar esquemas Zod, DTOs de validacion y especificacion OpenAPI en shared
Definir los esquemas de validacion con Zod para todas las solicitudes y respuestas de la API dentro de packages/shared/src/schemas. Generar o documentar la especificacion OpenAPI 3.0 correspondiente a los contratos de SPEC.md seccion 5 para consumo compartido.
- Requisitos: RNF-008, RNF-009, SPEC.md seccion 1, seccion 5 y seccion 8
- Dependencias: SH-001
- Criterios de aceptacion:
  - Los esquemas Zod cubren todos los endpoints de mesas, reservas, uniones y espera.
  - El paquete compila en ESM con declaraciones de tipos TypeScript en dist/.
  - Se genera un archivo openapi.json o modulo TypeScript que expone la especificacion contractual.
- Pruebas requeridas: Pruebas unitarias de validacion sobre payloads validos e invalidos (limites de tamano, cadenas vacias, tipos numericos).
- Estimacion: 1.5 dias
- Perfil: Backend / Fullstack

### SH-003: Configurar servidor de mocks para desacoplamiento de frontend
Configurar Mock Service Worker (MSW) en apps/web utilizando los esquemas y fixtures generados en packages/shared. Proveer respuestas simuladas para todos los endpoints REST y eventos WebSocket para permitir el avance del frontend de forma aislada.
- Requisitos: RNF-009, RNF-014, SPEC.md seccion 5 y seccion 6
- Dependencias: SH-002
- Criterios de aceptacion:
  - El frontend puede ejecutarse en modo mock mediante variable de entorno VITE_USE_MOCKS=true.
  - Todos los endpoints definidos en SPEC.md responden con datos realistas basados en contratos compartidos.
  - Las transiciones de estado de mesa y alertas pueden simularse localmente en el navegador.
- Pruebas requeridas: Pruebas de integracion en frontend verificando la intercepcion de peticiones por MSW.
- Estimacion: 1 dia
- Perfil: Frontend

### SH-004: Configurar Prisma ORM y migracion inicial con extension de exclusion
Instalar Prisma en apps/api, modelar las entidades Mesa, Reserva, AsignacionMesero, ListaEspera, UnionMesa y OutboxEvento. Crear la migracion SQL inicial incluyendo la extension btree_gist y la restriccion EXCLUDE para reservas solapadas en PostgreSQL 16.
- Requisitos: RNF-003, RNF-004, SPEC.md seccion 2, ARCHITECTURE.md seccion 7 y ADR-002
- Dependencias: SH-001
- Criterios de aceptacion:
  - El archivo schema.prisma refleja las 6 entidades con sus tipos, llaves foraneas e indices parciales.
  - La migracion inicial genera la extension btree_gist y la restriccion EXCLUDE sobre Reserva.
  - El cliente de Prisma se genera correctamente y puede conectarse a la base de datos de docker-compose.
- Pruebas requeridas: Pruebas de integracion contra base de datos validando que una insercion de reserva solapada dispare error de motor.
- Estimacion: 1.5 dias
- Perfil: Backend

---

## Backend: Modulos y Epicas Funcionales

### Epica BE-1: Nucleo del Plano y Gestion de Mesas

#### BE-001: Implementar CRUD de mesas y consulta de estado en vivo
Desarrollar el modulo MesasModule con servicios, controladores y repositorios Prisma para el registro, edicion, baja logica y consulta de mesas. Implementar el calculo en tiempo real de tieneReservaProxima evaluando la agenda de reservas dentro de la ventana de 30 minutos.
- Requisitos: RF-001, RF-002, RF-003, RF-004, RNF-001, SPEC.md seccion 5.1 y RN-08
- Dependencias: SH-004
- Criterios de aceptacion:
  - POST /sala/mesas crea mesa en estado Libre y valida numero_mesa unico activo (409 ante duplicado).
  - PATCH y DELETE aplican modificaciones y baja logica validando que la mesa no este ocupada ni en union.
  - GET /sala/mesas/estado-en-vivo retorna lista completa de mesas con flags tieneReservaProxima y ocupadaDesde.
- Pruebas requeridas: Pruebas unitarias de logica de calculo de ventana de reserva y pruebas de integracion HTTP de los endpoints CRUD.
- Estimacion: 1.5 dias
- Perfil: Backend

#### BE-002: Implementar transiciones de estado operativo de mesa
Construir la logica de cambio de estado fisico para mesas individuales mediante PATCH /sala/mesas/{mesaId}/estado. Restringir transiciones manuales a Limpieza pendiente y Libre, bloqueando cambios sobre mesas que formen parte de una union activa.
- Requisitos: RF-006, RF-007, RNF-001, SPEC.md seccion 5.2, RN-06, RN-07 y RN-15
- Dependencias: BE-001
- Criterios de aceptacion:
  - Transicion de Ocupada a Limpieza pendiente valida y confirmada (200).
  - Transicion de Limpieza pendiente a Libre valida y confirmada (200).
  - Cualquier transicion no permitida (por ejemplo Libre a Limpieza directamente) responde 409 TRANSICION_INVALIDA.
  - Si la mesa pertenece a una union activa, responde 409 MESA_EN_UNION.
- Pruebas requeridas: Pruebas unitarias de maquina de estados de mesa y pruebas de integracion para codigos de error 409.
- Estimacion: 1 dia
- Perfil: Backend

### Epica BE-2: Asignacion de Personal de Salon

#### BE-003: Implementar asignacion y reasignacion de meseros
Crear el servicio y endpoints para asignar personal de servicio a mesas especificas. Asegurar la atomicidad en la reasignacion cerrando la asignacion previa e iniciando la nueva en una sola transaccion de base de datos.
- Requisitos: RF-010, RF-011, SPEC.md seccion 5.3 y RN-16
- Dependencias: BE-001
- Criterios de aceptacion:
  - PUT /sala/mesas/{mesaId}/mesero registra la asignacion activa con fecha_hora_inicio.
  - Si ya existia un mesero asignado, la asignacion anterior se marca inactiva con fecha_hora_fin = now().
  - GET /sala/asignaciones lista asignaciones filtradas por mesero o estado activo.
- Pruebas requeridas: Pruebas unitarias de servicio y pruebas de integracion transaccionales en PostgreSQL.
- Estimacion: 1 dia
- Perfil: Backend

### Epica BE-3: Mensajeria Asincrona, Outbox y Tiempo Real

#### BE-004: Implementar patron Outbox transaccional y publicador RabbitMQ
Crear el servicio de persistencia OutboxService para registrar eventos dentro de la transaccion de dominio. Implementar el proceso relay en segundo plano que lee eventos pendientes, los publica en RabbitMQ bajo topics sala.* con cabeceras de correlacion y gestiona reintentos.
- Requisitos: RF-008, RNF-005, SPEC.md seccion 6.1, ARCHITECTURE.md ADR-003 y ADR-006
- Dependencias: SH-004
- Criterios de aceptacion:
  - Los eventos de dominio se insertan en la tabla outbox_evento en la misma transaccion SQL.
  - El relay publica mensajes en RabbitMQ con x-event-id, x-correlation-id y content-type application/json.
  - Si RabbitMQ no responde, el evento permanece pendiente con contador de intentos incrementado.
- Pruebas requeridas: Pruebas unitarias del relay y pruebas de integracion con RabbitMQ verificando recepcion de mensajes.
- Estimacion: 2 dias
- Perfil: Backend

#### BE-005: Implementar WebSocket Gateway para tiempo real con Socket.io
Crear el gateway SalaWebSocketGateway en NestJS bajo el namespace /sala. Conectar el relay de eventos o publicadores locales para emitir cambios de estado de mesas, alertas de reservas y avisos de lista de espera a los clientes conectados.
- Requisitos: RF-009, RNF-002, SPEC.md seccion 6.2 y ARCHITECTURE.md ADR-004
- Dependencias: BE-002
- Criterios de aceptacion:
  - Clientes pueden conectarse al namespace /sala y unirse a salas tematicas (plano, recepcion).
  - Cada transicion confirmada de mesa emite el evento mesa.estado_actualizado.
  - Latencia de emision menor a 2 segundos desde el commit de base de datos.
- Pruebas requeridas: Pruebas de integracion con cliente Socket.io simulado verificando la recepcion de eventos.
- Estimacion: 1.5 dias
- Perfil: Backend

### Epica BE-4: Ocupacion y Disparo de Dining Session

#### BE-006: Implementar ocupacion de mesa con validaciones operativas y dining session
Desarrollar el endpoint POST /sala/mesas/{mesaId}/ocupar ejecutando validaciones de estado fisico, advertencia de reserva proxima y sobrecupo. Generar el identificador unico sessionId UUID v4 y persistir en outbox los eventos de inicio de sesion y actualizacion de estado.
- Requisitos: RF-005, RF-017, RNF-004, SPEC.md seccion 5.2, flujo F1, RN-01, RN-02, RN-03, RN-05, ADR-005 y ADR-010
- Dependencias: BE-001, BE-003, BE-004
- Criterios de aceptacion:
  - Ocupar mesa Libre responde 200 con sessionId UUID v4 y estado Ocupada.
  - Si tiene reserva proxima a menos de 30 min y forzarOcupacion es false, responde 409 RESERVA_PROXIMA_PRESENTE.
  - Si comensales supera la capacidad y forzarSobrecupo es false, responde 409 SOBRECUPO_DETECTADO.
  - Si se envian las banderas forzar, la ocupacion procede exitosamente devolviendo advertencias informativas.
  - Se genera en outbox el evento sala.dining_session.iniciada con sessionId y meseroId.
- Pruebas requeridas: Pruebas unitarias de casos borde (sobrecupo, reservas) y pruebas de integracion transaccionales.
- Estimacion: 2 dias
- Perfil: Backend

### Epica BE-5: Gestion de Reservas y Agenda

#### BE-007: Implementar creacion, consulta y reprogramacion de reservas
Construir ReservasModule para registrar, listar y modificar reservaciones de mesas. Integrar la validacion de rango temporal semiabierto tstzrange y mapear violaciones de exclusion de PostgreSQL a codigos de error 409 RESERVA_SOLAPADA.
- Requisitos: RF-012, RF-013, RF-014, RF-015, RNF-003, SPEC.md seccion 5.4, flujo F2, RN-09 y RN-10
- Dependencias: BE-001
- Criterios de aceptacion:
  - POST /sala/reservas valida cantidadPersonas mayor a 0 y menor o igual a capacidad de la mesa.
  - Intento de reservar horario solapado sobre la misma mesa retorna 409 RESERVA_SOLAPADA.
  - GET /sala/reservas/disponibilidad lista mesas libres para la fecha, hora, duracion y aforo solicitados.
  - Cancelacion y reprogramacion validan estados y actualizan franjas horarias de forma consistente.
- Pruebas requeridas: Pruebas de integracion validando concurrencia de reservas simultaneas e inserciones validas.
- Estimacion: 2 dias
- Perfil: Backend

#### BE-008: Implementar proceso programado de alertas de reserva y marcado de No-show
Implementar tareas programadas en NestJS (cron jobs) para detectar reservas que entren en la ventana de anticipacion de 30 minutos y emitir sala.reserva.proxima_alerta de forma idempotente. Incorporar endpoint y logica para marcar reservas vencidas en estado No-show.
- Requisitos: RF-016, RF-017b, SPEC.md seccion 5.4, RN-08, RN-11 y RN-20
- Dependencias: BE-004, BE-007
- Criterios de aceptacion:
  - El cron job detecta reservas en ventana de 30 minutos con alerta_emitida = false y publica el evento en outbox.
  - POST /sala/reservas/{reservaId}/no-show actualiza el estado a No-show y libera la franja horaria.
  - No se generan alertas duplicadas para la misma reserva.
- Pruebas requeridas: Pruebas unitarias del servicio cron simulando avance del reloj y pruebas de integracion de transicion a No-show.
- Estimacion: 1.5 dias
- Perfil: Backend

### Epica BE-6: Uniones de Mesas para Grupos

#### BE-009: Implementar creacion y disolucion atomica de uniones de mesas
Desarrollar el modulo UnionesModule para agrupar dos o mas mesas fisicas pertenecientes a la misma zona en una unica sesion de servicio. Implementar la disolucion atomica retornando cada mesa individual a Limpieza pendiente.
- Requisitos: RF-018, RF-019, RNF-004, SPEC.md seccion 5.5, flujo F3, RN-12, RN-13, RN-14 y ADR-009
- Dependencias: BE-004, BE-006
- Criterios de aceptacion:
  - POST /sala/mesas/uniones valida que todas las mesas existan, esten Libres y compartan la misma zona.
  - Si las mesas pertenecen a zonas distintas, rechaza con 409 ZONA_INCOMPATIBLE.
  - Si alguna mesa esta ocupada, rechaza con 409 MESA_NO_DISPONIBLE sin modificar el resto.
  - Creacion exitosa genera sessionId UUID v4 y emite sala.dining_session.iniciada con unionId y mesasIds.
  - POST /sala/mesas/uniones/{unionId}/liberar disuelve la union y pasa todas las mesas a Limpieza pendiente en una sola transaccion.
- Pruebas requeridas: Pruebas de integracion transaccionales verificando atomicidad ante errores inyectados.
- Estimacion: 2 dias
- Perfil: Backend

### Epica BE-7: Lista de Espera Presencial

#### BE-010: Implementar registro de lista de espera y asignacion FIFO automatica
Construir EsperaModule para registrar comensales en espera presencial. Conectar el evento de fin de limpieza (mesa a Libre) para buscar clientes en espera compatibles con la capacidad liberada y emitir notificaciones por WebSocket a recepcion.
- Requisitos: RF-020, RF-021, RF-022, SPEC.md seccion 5.6, flujo F4, RN-17 y RN-18
- Dependencias: BE-002, BE-005
- Criterios de aceptacion:
  - POST /sala/espera registra cliente con hora_llegada automatica y estado En espera.
  - Al marcar una mesa como Libre, se busca el cliente compatible mas antiguo (FIFO) y transiciona a Notificado.
  - Se emite el evento espera.mesa_disponible por WebSocket al personal de recepcion.
  - PATCH /sala/espera/{esperaId}/estado permite transicionar a Sentado o Cancelado.
- Pruebas requeridas: Pruebas unitarias de ordenamiento y filtrado de cola y pruebas de integracion extremo a extremo del flujo de liberacion.
- Estimacion: 1.5 dias
- Perfil: Backend

### Epica BE-8: Seguridad, Observabilidad y Suite Transversal

#### BE-011: Implementar guards de autenticacion, roles, correlacion y health check
Implementar IdentityGuard y RolesGuard para consumir la identidad provista por el Gateway, CorrelationInterceptor para propagar x-correlation-id en logs JSON estructurados, y el endpoint GET /health verificando PostgreSQL y RabbitMQ.
- Requisitos: RNF-006, RNF-007, RNF-011, SPEC.md seccion 1, seccion 5.7, ARCHITECTURE.md seccion 8 y seccion 9
- Dependencias: BE-001, BE-004
- Criterios de aceptacion:
  - Peticiones sin cabeceras de identidad requeridas son rechazadas con 401.
  - Roles no autorizados reciben 403 segun la matriz de autorizacion de SPEC.md seccion 1.1.
  - Toda peticion incluye x-correlation-id en logs y respuesta.
  - GET /health reporta estado 200 con chequeos de conexion a PostgreSQL y canal AMQP de RabbitMQ.
- Pruebas requeridas: Pruebas unitarias de guards y pruebas de integracion de seguridad y salud.
- Estimacion: 1.5 dias
- Perfil: Backend

#### BE-012: Construir suite de pruebas de carga, concurrencia y resiliencia
Desarrollar pruebas automatizadas de integracion y concurrencia simulando 50 solicitudes simultaneas de reserva sobre la misma franja y ocupaciones concurrentes de mesas. Medir latencias p95 y verificar ausencia de solapamientos o estados corruptos.
- Requisitos: RNF-001, RNF-003, RNF-004, RNF-012, SPEC.md seccion 7 criterios T1.3 y T2.3
- Dependencias: BE-006, BE-007, BE-009
- Criterios de aceptacion:
  - 50 peticiones simultaneas para reservar la misma mesa en el mismo horario resultan en exactamente 1 exito y 49 codigos 409.
  - Pruebas de ocupacion concurrente garantizan exactamente 1 sesion iniciada.
  - Medicion de latencia confirma p95 menor a 300 ms en consultas y 500 ms en comandos bajo carga de 50 req/s.
- Pruebas requeridas: Suite de pruebas de carga y concurrencia con Jest o k6.
- Estimacion: 2 dias
- Perfil: QA / Backend

---

## Frontend: Pantallas y Flujos de Usuario

### Epica FE-1: Base de Diseno y Capa de Comunicacion

#### FE-001: Implementar tokens de diseno, temas y cliente API centralizado
Configurar tailwind.config.js con los tokens exactos de guia-visual-componentes.md (colores primary #C2410C, soft #FFF7ED, ink #111827, radios control 8px y card 12px). Crear el cliente Axios o Fetch tipado con manejo de x-correlation-id y configuracion base de TanStack Query.
- Requisitos: RNF-010, guia visual v2.0 seccion 2 y seccion 7, SPEC.md seccion 1
- Dependencias: SH-001
- Criterios de aceptacion:
  - Clases utilitarias de Tailwind reflejan la paleta corporativa y tipografia Inter.
  - El cliente HTTP inyecta cabeceras de trazabilidad y procesa respuestas de error con formato estandar.
  - TanStack Query Provider configurado con politicas de reintento y cache adecuadas.
- Pruebas requeridas: Pruebas unitarias de cliente HTTP y verificacion visual de clases de estilos.
- Estimacion: 1 dia
- Perfil: Frontend

#### FE-002: Implementar hook de WebSockets e invalidacion de cache
Crear el hook useSalaSocket conectandose al namespace /sala mediante socket.io-client. Escuchar los eventos mesa.estado_actualizado, reserva.proxima_alerta y espera.mesa_disponible e invalidar automaticamente las queries activas de TanStack Query.
- Requisitos: RF-009, RNF-002, SPEC.md seccion 6.2 y ARCHITECTURE.md ADR-004
- Dependencias: SH-003, FE-001
- Criterios de aceptacion:
  - El socket se conecta y maneja reconexion transparente sin perder estado.
  - La recepcion de mesa.estado_actualizado invalida la cache de mesas en vivo provocando re-render inmediato.
  - Limpieza de suscripciones en desmontaje de componentes para evitar memory leaks.
- Pruebas requeridas: Pruebas unitarias del hook con simulador de WebSocket de Vitest.
- Estimacion: 1 dia
- Perfil: Frontend

### Epica FE-2: Plano de Sala y Gestion Operativa

#### FE-003: Construir vista de Plano de Sala con cards de mesa reactivas
Implementar la vista principal PlanoSalaView y el componente MesaCard conforme al diseno de guia visual seccion 4.1. Mostrar numero de mesa, aforo, tiempo ocupada, dot semantico de estado (verde, ambar, amarillo) y distintivo azul Reservada si tiene reserva proxima.
- Requisitos: RF-004, RF-023, RNF-010, guia visual seccion 4.1 y seccion 9.5, SPEC.md seccion 5.1
- Dependencias: SH-003, FE-001, FE-002
- Criterios de aceptacion:
  - La cuadricula muestra las mesas agrupadas o filtradas por zona con diseno responsivo en 12, 8 y 4 columnas.
  - Mesa con tieneReservaProxima = true renderiza badge azul sin alterar su estado fisico Libre.
  - Componente maneja estados de carga (skeletons), lista vacia y error con boton de reintento.
- Pruebas requeridas: Pruebas de componentes con React Testing Library cubriendo renderizado de cada estado.
- Estimacion: 2 dias
- Perfil: Frontend

#### FE-004: Implementar modal de ocupacion con advertencias operativas
Construir el formulario modal para ocupar una mesa solicitando cantidad de comensales y seleccion de mesero. Si la mesa tiene reserva proxima o sobrecupo, mostrar advertencias visuales claras solicitando confirmacion explicita antes de enviar forzarOcupacion o forzarSobrecupo.
- Requisitos: RF-005, RF-023, RNF-010, SPEC.md seccion 5.2, flujo F1, RN-02 y RN-05
- Dependencias: SH-003, FE-003
- Criterios de aceptacion:
  - Formulario valida campos obligatorios con etiquetas visibles y textos de ayuda.
  - Si comensales supera la capacidad, se despliega advertencia ambar requiriendo marcar confirmacion de sobrecupo.
  - Si la mesa tiene reserva en los proximos 30 min, se despliega alerta azul requiriendo confirmacion explicita.
  - Al confirmar, ejecuta mutacion POST /sala/mesas/{id}/ocupar y cierra el modal tras exito.
- Pruebas requeridas: Pruebas de interaccion simulando envio normal, deteccion de advertencias y confirmacion forzada.
- Estimacion: 1.5 dias
- Perfil: Frontend

#### FE-005: Implementar controles de limpieza fisica y asignacion de meseros
Crear modales y acciones rapidas sobre la card de mesa para cambiar estado a Limpieza pendiente o Libre, y para asignar o reasignar el mesero responsable de la estacion.
- Requisitos: RF-006, RF-007, RF-010, RF-011, RF-023, SPEC.md seccion 5.2 y seccion 5.3
- Dependencias: SH-003, FE-003
- Criterios de aceptacion:
  - Boton Marcar limpia transiciona mesa de Limpieza pendiente a Libre deshabilitando el control durante la peticion.
  - Accion Salida de comensales pasa mesa Ocupada a Limpieza pendiente con confirmacion.
  - Selector de mesero ejecuta reasignacion y actualiza los metadatos de la tarjeta.
- Pruebas requeridas: Pruebas unitarias de componentes verificando mutaciones de cambio de estado y reasignacion.
- Estimacion: 1 dia
- Perfil: Frontend

#### FE-006: Construir panel de administracion y configuracion del plano
Implementar la interfaz para que el administrador cree, edite y de baja mesas fisicas definiendo numero, capacidad y zona, con validacion de no duplicidad y proteccion ante eliminacion de mesas en uso.
- Requisitos: RF-001, RF-002, RF-003, RNF-010, SPEC.md seccion 5.1
- Dependencias: SH-003, FE-001
- Criterios de aceptacion:
  - Tabla interactiva con busqueda y ordenamiento segun guia visual seccion 3.5.
  - Formulario de creacion y edicion con validacion Zod en cliente.
  - Confirmacion modal destructiva para baja logica advirtiendo si la mesa tiene reservas activas.
- Pruebas requeridas: Pruebas de integracion en frontend sobre el flujo completo de alta, modificacion y baja.
- Estimacion: 1.5 dias
- Perfil: Frontend

### Epica FE-3: Modulo de Reservas y Agenda

#### FE-007: Construir vista de agenda y disponibilidad de reservas
Crear la vista ReservasView mostrando la agenda diaria del restaurante, filtro por fecha y franjas horarias, y buscador de mesas disponibles segun cantidad de personas requeridas.
- Requisitos: RF-015, RF-024, RNF-010, SPEC.md seccion 5.4 y flujo F2
- Dependencias: SH-003, FE-001
- Criterios de aceptacion:
  - Selector de fecha y visualizacion de bloques horarios por mesa.
  - Filtro interactivo que consulta GET /sala/reservas/disponibilidad y resalta mesas aptas.
  - Indicadores visuales de estado de reserva (Confirmada, Cancelada, Completada, No-show).
- Pruebas requeridas: Pruebas de renderizado de agenda y filtrado reactivo de disponibilidad.
- Estimacion: 2 dias
- Perfil: Frontend

#### FE-008: Implementar formularios de gestion de reserva y flujo de No-show
Desarrollar modales para agendar nueva reserva con datos de contacto y aforo, reprogramar horario existente, cancelar reserva confirmada y registrar No-show con confirmacion de recepcion.
- Requisitos: RF-012, RF-013, RF-014, RF-017b, RF-024, RNF-010, SPEC.md seccion 5.4 y RN-10
- Dependencias: SH-003, FE-007
- Criterios de aceptacion:
  - Formulario valida telefono, nombre y aforo menor o igual a capacidad de la mesa seleccionada.
  - Captura y muestra errores 409 RESERVA_SOLAPADA con mensaje amigable sin limpiar los datos del formulario.
  - Boton de accion para marcar No-show disponible para reservas que superen la tolerancia horaria.
- Pruebas requeridas: Pruebas de integracion simulando altas exitosas, manejo de colisiones de horario y cancelaciones.
- Estimacion: 1.5 dias
- Perfil: Frontend

### Epica FE-4: Uniones de Mesas

#### FE-009: Implementar flujo interactivo de seleccion multiple y union por zona
Construir el modo de union de mesas en el plano de sala permitiendo seleccionar dos o mas mesas libres. Bloquear la seleccion de mesas de zonas diferentes, validar el aforo conjunto y proveer la accion de disolucion atomica con confirmacion.
- Requisitos: RF-018, RF-019, RNF-010, SPEC.md seccion 5.5, flujo F3, RN-12 y ADR-009
- Dependencias: SH-003, FE-003
- Criterios de aceptacion:
  - Al seleccionar la primera mesa, el sistema deshabilita mesas pertenecientes a zonas distintas o no Libres.
  - Panel inferior muestra resumen de aforo total consolidado y selector de mesero responsable.
  - Accion Liberar union despliega modal confirmando la disolucion y pase de mesas a limpieza.
- Pruebas requeridas: Pruebas de interfaz verificando restricciones de seleccion por zona y mutaciones de union y disolucion.
- Estimacion: 1.5 dias
- Perfil: Frontend

### Epica FE-5: Lista de Espera Presencial

#### FE-010: Construir vista de lista de espera y alertas de mesa compatible
Desarrollar la vista ListaEsperaView para registrar comensales presenciales y monitorear la fila en orden FIFO. Incorporar toast o banner flotante en tiempo real cuando el socket notifique que una mesa compatible ha quedado libre.
- Requisitos: RF-020, RF-021, RF-022, RF-025, RNF-010, SPEC.md seccion 5.6, flujo F4 y RN-17
- Dependencias: SH-003, FE-001, FE-002
- Criterios de aceptacion:
  - Formulario rapido para agregar cliente (nombre, telefono, personas) a la cola presencial.
  - Tabla o lista de tarjetas ordenadas por tiempo de espera con acciones Sentar y Cancelar.
  - Al recibir espera.mesa_disponible por WebSocket, se muestra alerta destacada con opcion de asignar mesa directamente.
- Pruebas requeridas: Pruebas de componentes simulando recepcion de evento WebSocket y transiciones de estado de espera.
- Estimacion: 1.5 dias
- Perfil: Frontend

---

## Orden de Ejecucion Sugerido

El plan se estructura en 3 hitos de desarrollo iterativo. Backend y Frontend avanzan en paralelo a partir de los mocks generados en la Fase 0, convergiendo en puntos de sincronizacion explicitos.

| Hito / Periodo | Tareas Backend (Paralelo) | Tareas Frontend (Paralelo) | Puntos de Sincronizacion Requeridos |
|---|---|---|---|
| Hito 1: Fundamentos y Plano (Semana 1) | SH-001, SH-002, SH-004, BE-001, BE-002, BE-003 | SH-001, SH-002, SH-003, FE-001, FE-002, FE-003 | SH-002 publicado para generar mocks en SH-003. FE-003 avanza contra mocks mientras BE-001 se implementa. |
| Hito 2: Ciclo Operativo, Tiempo Real y Eventos (Semana 2) | BE-004, BE-005, BE-006, BE-009, BE-011 | FE-004, FE-005, FE-006, FE-009 | BE-005 (WebSocket) y BE-006 (Ocupacion) desplegados en entorno local/dev para conectar FE-002, FE-004 y FE-009. |
| Hito 3: Reservas, Espera y Calidad (Semana 3) | BE-007, BE-008, BE-010, BE-012 | FE-007, FE-008, FE-010 | BE-007 y BE-010 listos para pruebas de integracion end-to-end con FE-007, FE-008 y FE-010. Ejecucion de suite BE-012. |

---

## Tabla de Trazabilidad de Requisitos

| Requisito | Descripcion Breve | Tareas Backend | Tareas Frontend |
|---|---|---|---|
| RF-001 | Registrar mesa fisica | BE-001 | FE-006 |
| RF-002 | Editar mesa fisica | BE-001 | FE-006 |
| RF-003 | Baja logica de mesa | BE-001 | FE-006 |
| RF-004 | Consultar estado en vivo y reserva proxima | BE-001 | FE-003 |
| RF-005 | Ocupar mesa y emitir dining session | BE-006 | FE-004 |
| RF-006 | Transicionar mesa a Limpieza pendiente | BE-002 | FE-005 |
| RF-007 | Transicionar mesa a Libre tras limpieza | BE-002 | FE-005 |
| RF-008 | Publicar sala.mesa.estado_actualizado | BE-004 | N/A |
| RF-009 | Notificar en tiempo real por WebSocket | BE-005 | FE-002 |
| RF-010 | Asignar mesero a mesa | BE-003 | FE-005 |
| RF-011 | Reasignar mesero a mesa | BE-003 | FE-005 |
| RF-012 | Registrar reserva agendada con aforo | BE-007 | FE-008 |
| RF-013 | Reprogramar reserva confirmada | BE-007 | FE-008 |
| RF-014 | Cancelar reserva confirmada | BE-007 | FE-008 |
| RF-015 | Consultar disponibilidad de mesas | BE-007 | FE-007 |
| RF-016 | Alerta de reserva proxima a recepcion | BE-008 | FE-007 |
| RF-017 | Marcar reserva Completada al sentar | BE-006 | FE-004 |
| RF-017b| Marcar reserva No-show tras tolerancia | BE-008 | FE-008 |
| RF-018 | Unir mesas libres de la misma zona | BE-009 | FE-009 |
| RF-019 | Liberar y disolver union de mesas | BE-009 | FE-009 |
| RF-020 | Notificar mesa compatible a lista de espera | BE-010 | FE-010 |
| RF-021 | Registrar cliente en lista de espera | BE-010 | FE-010 |
| RF-022 | Actualizar estado en lista de espera | BE-010 | FE-010 |
| RF-023 | Vista Plano de Sala reactiva | N/A | FE-003, FE-004, FE-005 |
| RF-024 | Vista Agenda y gestion de Reservas | N/A | FE-007, FE-008 |
| RF-025 | Vista Lista de Espera presencial | N/A | FE-010 |
| RNF-001 | Latencia REST p95 menor a 300ms/500ms | BE-001, BE-002, BE-012 | N/A |
| RNF-002 | Propagacion WebSocket p95 menor a 2s | BE-005 | FE-002 |
| RNF-003 | Integridad sin solapamiento (EXCLUDE) | SH-004, BE-007, BE-012 | N/A |
| RNF-004 | Atomicidad transaccional multi-fila | SH-004, BE-006, BE-009, BE-012 | N/A |
| RNF-005 | Entrega confiable RabbitMQ (Outbox) | BE-004, BE-006 | N/A |
| RNF-006 | Disponibilidad mensual y endpoint health | BE-011 | N/A |
| RNF-007 | Seguridad e identidad Gateway (401/403) | BE-011 | FE-001 |
| RNF-008 | Limites de tamano de payload (64KB/16KB) | SH-002, BE-011 | N/A |
| RNF-009 | Contratos unicos en shared | SH-002, SH-003 | FE-001 |
| RNF-010 | Conformidad con Guia Visual v2.0 | N/A | FE-001, FE-003 a FE-010 |
| RNF-011 | Observabilidad y correlacion JSON | BE-011 | FE-001 |
| RNF-012 | Escalabilidad 200 mesas / 100 sockets | BE-005, BE-012 | N/A |
| RNF-013 | Pipeline CI menor a 10 min y calidad | SH-001 | SH-001 |
| RNF-014 | Despliegue desacoplado sin dependencias | SH-003, BE-004 | N/A |

---

## Brechas Detectadas, Riesgos de Planificacion y Decisiones Pendientes

### Brechas Detectadas
1. Contrato de cabeceras de autenticacion del Gateway (Q4): No esta definido el nombre exacto de las cabeceras HTTP que propagara el Gateway (por ejemplo x-user-id vs sub, x-user-roles en JSON o separado por comas). La tarea BE-011 asume x-user-id y x-user-roles de forma provisional.
2. Formato de identificador de mesero externo (Q2): No se ha confirmado si id_mesero es un UUID o un identificador alfanumerico arbitrario del proveedor de Auth. Las entidades y esquemas lo tratan como varchar(64).
3. Transporte de WebSockets a traves del API Gateway: No se describe si el API Gateway del restaurante manejara el upgrade a WebSockets y la validacion de tokens en el handshake, o si el frontend se conectara directamente al puerto 3001 del microservicio de Sala.

### Riesgos de Planificacion
1. Dependencia de PostgreSQL 16 con extension btree_gist en entornos CI: Las pruebas de integracion que validen la restriccion EXCLUDE requieren una instancia real de PostgreSQL con privilegios para habilitar la extension. Ejecutar CI puramente en memoria fallara si no se levanta un contenedor de PostgreSQL como service container en GitHub Actions.
2. Sincronizacion de esquemas Zod entre ESM y CommonJS: El paquete packages/shared compila a ESM mientras que apps/api compila a CommonJS. Es critico validar que la exportacion de esquemas Zod en SH-002 no genere errores de importacion en tiempo de ejecucion en NestJS (deuda tecnica DT-04).
3. Latencia del Outbox Relay: Si el relay de outbox se implementa mediante sondeo a base de datos (polling), podria comprometer el cumplimiento de RNF-002 (propagacion en menos de 2 segundos) si el intervalo de revision es muy alto. Se recomienda disparar el relay inmediatamente tras cada commit local mediante EventEmitter de NestJS, usando la tabla outbox como respaldo de persistencia y reintento.

### Tareas Dependientes de Decisiones Abiertas
- BE-011 depende de la confirmacion formal del equipo de Auth y Gateway sobre las cabeceras de identidad y la lista de roles del sistema.
- BE-003 y BE-006 dependen de la confirmacion del formato final de id_mesero.
