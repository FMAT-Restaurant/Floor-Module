# Floor-Module (Sala y Reservas)

> Microservicio de gestión física del plano de sala, ciclo operativo de mesas, asignación de meseros, reservas y lista de espera para el ecosistema gastronómico del restaurante.

---

## Arquitectura del Repositorio (Monorepo)

Este módulo está estructurado como un **Service-Level Monorepo** gestionado con `pnpm` workspaces y `Turborepo`:

```text
Floor-Module/
├── apps/
│   ├── api/                     # Backend API (NestJS + WebSockets + RabbitMQ)
│   └── web/                     # Frontend SPA (React + Vite + Tailwind CSS)
├── packages/
│   └── shared/                  # Contratos (@floor/shared): Enums, DTOs, Eventos
├── docs/
│   ├── Microservicio_Sala_Reservas.md  # Especificación de Dominio y Flujos
│   ├── guia-visual-componentes.md      # Guía Visual y Design System v2.0 (UI Kit)
│   └── adr/
│       └── ADR-001-stack-y-monorepo.md # Decisión Formal de Arquitectura
├── docker-compose.yml           # PostgreSQL 16 y RabbitMQ locales
├── pnpm-workspace.yaml          # Workspaces de pnpm
├── turbo.json                   # Pipeline de tareas y caché
└── package.json                 # Scripts raíz del monorepo
```

---

## Stack Tecnológico

* **Lenguaje:** TypeScript 5.x (End-to-End)
* **Backend:** Node.js con NestJS
* **Frontend:** React 18/19 con Vite y Tailwind CSS
* **Base de Datos:** PostgreSQL 16
* **Message Broker:** RabbitMQ (AMQP)
* **Comunicación en Vivo:** WebSockets (Socket.io)
* **Gestión Monorepo:** pnpm + Turborepo

Para más detalles sobre las decisiones de diseño y trade-offs evaluados, consulta el [ADR-001](docs/adr/ADR-001-stack-y-monorepo.md), la [Especificación Técnica](docs/Microservicio_Sala_Reservas.md) y la [Guía Visual de Componentes](docs/guia-visual-componentes.md).

---

## Inicio Rápido (Desarrollo Local)

### 1. Requisitos Previos
* [Node.js](https://nodejs.org/) (v20 o superior)
* [pnpm](https://pnpm.io/) (`npm install -g pnpm` o `corepack enable pnpm`)
* [Docker](https://www.docker.com/) y Docker Compose

### 2. Levantar Servicios de Infraestructura (Postgres + RabbitMQ)
```bash
docker compose up -d
```
* **PostgreSQL:** `localhost:5432` (`user: postgres`, `db: floor_module_db`)
* **RabbitMQ UI:** `http://localhost:15672` (`user: guest`, `password: guest`)

### 3. Instalar Dependencias
```bash
pnpm install
```

### 4. Ejecutar Entorno de Desarrollo (API + Web)
```bash
pnpm dev
```
* **Frontend:** `http://localhost:3000`
* **API Backend:** `http://localhost:3001`

---

## Flujo de Trabajo y Ramas (Git Workflow)

1. **Rama Base:** Toda rama de trabajo se deriva directamente de `main` actualizada:
   ```bash
   git checkout main && git pull origin main
   git checkout -b <tipo>/<ID>-<descripcion-corta>
   ```
   *Ejemplos de nomenclatura:*
   * `chore/SH-001-tooling-calidad`
   * `feat/BE-001-crud-mesas`
   * `feat/FE-003-plano-sala-cards`
   * `fix/BE-002-transicion-estados`

2. **Commits:** Seguir Conventional Commits (`feat(api): ...`, `fix(web): ...`, `chore(tooling): ...`).
3. **Pull Requests:**
   * Abrir PR directamente hacia `main`.
   * Enlazar el issue correspondiente en la descripción (ej. `Closes #1`).
   * El pipeline de CI debe pasar en verde (`lint`, `build`, `test`) antes de integrar.
