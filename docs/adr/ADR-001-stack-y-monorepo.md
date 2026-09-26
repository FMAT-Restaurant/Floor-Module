# ADR-001: Adopción de Monorepo por Módulo y Stack Full TypeScript

* **Estado:** Aceptado
* **Fecha:** 26 de septiembre de 2026
* **Decisores:** Equipo de Arquitectura e Ingeniería de Sala y Reservas
* **Módulo:** Microservicio de Sala y Reservas (`salaModule`)

---

## 1. Contexto y Planteamiento del Problema

El microservicio de **Sala y Reservas** gestiona la operativa física del salón (mesas, zonas, asignaciones de meseros, reservas y lista de espera presencial). Dentro del ecosistema POS del restaurante, presenta los siguientes desafíos de diseño y arquitectura:

1. **Alta Reactividad y Tiempo Real:** El estado físico de las mesas (`Libre`, `Ocupada`, `Limpieza pendiente`) y las alertas de reserva próxima deben transmitirse en tiempo real a múltiples terminales de meseros, estaciones de hostess y pantallas de sala sin latencia ni sobrecarga de *polling*.
2. **Contratos Fuertemente Tipados:** Los modelos de datos (`Mesa`, `Reserva`, `UnionMesa`, `ListaEspera`) y los payloads de eventos asíncronos (`sala.dining_session.iniciada`, `sala.mesa.estado_actualizado`) son consumidos tanto por la interfaz de usuario como por la lógica de dominio.
3. **Consistencia Transaccional Estricta (ACID):** Las uniones de mesas para grupos grandes y el agendamiento de reservas requieren control de concurrencia y validación matemática de no solapamiento temporal.
4. **Agilidad y Velocidad de Entrega:** El equipo necesita iterar sobre vistas de usuario (alineadas a los mockups de diseño) y endpoints de backend sin la fricción de versionar y publicar paquetes npm intermedios para compartir contratos.

Se evaluaron dos interrogantes principales:
* ¿Cómo estructurar el código fuente: un repositorio único (**Monorepo**) o repositorios separados (**Polyrepo** / 1 Front + 1 Back)?
* ¿Cuál es el **Stack Tecnológico** idóneo para soportar estos requerimientos?

---

## 2. Decisión de Diseño

Se aprueban las siguientes directrices de arquitectura:

### 2.1 Topología de Repositorio: Monorepo a Nivel de Módulo (*Service-Level Monorepo*)
El microservicio de Sala y Reservas se estructurará como un **Monorepo independiente** orquestado mediante **pnpm workspaces** y **Turborepo**:

```text
sala-module/
├── apps/
│   ├── api/                     # Backend API (NestJS + WebSockets + RabbitMQ)
│   └── web/                     # Frontend SPA (React + Vite + Tailwind CSS)
├── packages/
│   └── shared/                  # Tipos TypeScript, DTOs, Enums y schemas Zod
├── docs/
│   └── adr/                     # Architectural Decision Records
├── docker-compose.yml           # Infraestructura local (PostgreSQL + RabbitMQ)
├── turbo.json                   # Pipeline de tareas y caché inteligente
└── package.json                 # Workspaces raíz
```

### 2.2 Stack Tecnológico Oficial

| Capa / Rol | Tecnología Elegida | Justificación Técnica |
|---|---|---|
| **Lenguaje Base** | **TypeScript 5.x** | Unifica el lenguaje en todo el módulo; habilita *Type Safety* de extremo a extremo (Base de datos ➔ API ➔ Eventos ➔ Frontend). |
| **Backend Framework** | **NestJS (Node.js)** | Arquitectura modular estricta (Controllers, Services, Modules). Soporte nativo para WebSockets (Gateways con Socket.io) y microservicios con brokers (RabbitMQ). |
| **Base de Datos** | **PostgreSQL 16** | Soporte transaccional ACID indispensable para agrupamiento de mesas (`UnionMesa`) y tipos de rango temporal (`tstzrange` con restricciones `EXCLUDE`) para bloquear matemáticamente el doble agendamiento de reservas. |
| **ORM & Migraciones** | **Prisma** o **Drizzle ORM** | Generación automática de tipos y migraciones declarativas con cero desalineación respecto a la base de datos física. |
| **Message Broker** | **RabbitMQ** (o **Redis Streams**) | Mensajería ligera y confiable para emitir eventos de integración desacoplados hacia Órdenes/Cocina y Cuenta/Pagos. |
| **Frontend Framework** | **React 18/19 + Vite** | Alta velocidad de desarrollo y renderizado eficiente para componentes dinámicos de salón. |
| **Diseño y UI** | **Tailwind CSS + shadcn/ui** | Fidelidad idéntica a los mockups interactivos aprobados (`mockups_sala.html`). |
| **Comunicación en Vivo** | **WebSockets (Socket.io)** | Notificación inmediata de transiciones de mesas y alertas a hostess/meseros. |
| **Caché y Estado Remoto** | **TanStack Query (React Query)** | Invalida y refresca la caché de clientes en milisegundos tras recibir eventos por WebSockets. |
| **Monorepo Tooling** | **pnpm + Turborepo** | Enlaces simbólicos ultraeficientes en disco y compilación/testeo en paralelo con caché local y remota. |

---

## 3. Alternativas Evaluadas y Razones de Descarte

### Alternativa 1: Repositorios Separados (Polyrepo: 1 Repo Front + 1 Repo Back)
* **Descripción:** Un repositorio git para la API en NestJS y otro para el frontend en React.
* **Razón de descarte:** En un módulo donde las reglas de negocio, los estados (`Libre`, `Ocupada`, `Limpieza pendiente`) y los payloads de los eventos cambian a la par, el modelo polyrepo obliga a:
  - Duplicar interfaces y DTOs manualmente en ambos lados, o bien
  - Crear, versionar y publicar un paquete npm privado de tipos (`@restaurante/sala-types`) para cada pequeño cambio de contrato.
  - Además, fragmenta los Pull Requests y dificulta el levantamiento del entorno de desarrollo local.

### Alternativa 2: Backend en Python (FastAPI) o Go (Fiber/Gin)
* **Descripción:** Implementar la lógica del servidor en Python o Go y el frontend en TypeScript/React.
* **Razón de descarte:** Aunque FastAPI y Go tienen un rendimiento excelente, se rompe la homogeneidad del lenguaje. Se pierde la capacidad de compartir esquemas de validación (Zod/DTOs) y tipos directamente en tiempo de desarrollo, introduciendo una capa de serialización y mantenimiento adicional que no aporta ventajas sustanciales para la escala operativa de este microservicio.

---

## 4. Consecuencias

### 4.1 Positivas (Beneficios)
* **Contratos Compartidos e Inmutables (`Single Source of Truth`):** Al modificar un enum o campo en `packages/shared`, tanto `apps/api` como `apps/web` reflejan el cambio inmediatamente y señalan errores en tiempo de compilación.
* **Pull Requests Atómicos:** Una historia de usuario (ej. *"Soporte para unión de mesas con confirmación visual"*) se somete a revisión y se mergea de forma integral: backend, contratos y UI en una sola confirmación.
* **Experiencia de Desarrollo Local Superior:** Con `pnpm install` y un comando `pnpm dev` se levanta la infraestructura completa coordinada con Docker.
* **Independencia de Despliegue:** Al ser un monorepo exclusivo del módulo de Sala, sus pipelines de CI/CD son autónomos y no bloquean ni dependen del ciclo de release de Cocina o Pagos.

### 4.2 Riesgos Identificados y Mitigaciones
* **Riesgo:** Despliegues innecesarios del frontend cuando solo se modifica lógica interna del backend (o viceversa).
  * **Mitigación:** Configuración de filtros en Turborepo y GitHub Actions / GitLab CI utilizando `turbo run build --filter=...[HEAD^1]`, garantizando que solo se construya y despliegue el artefacto afectado.
