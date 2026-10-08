# AGENTS.md — Floor-Module (Sala y Reservas)

Microservicio del ecosistema POS FMAT-Restaurant que gestiona plano de mesas, estado físico en tiempo real, meseros, reservas, uniones y lista de espera.
Monorepo pnpm + Turborepo: API NestJS (`@floor/api`), SPA React (`@floor/web`) y contratos compartidos (`@floor/shared`).
Estado: andamiaje inicial; los módulos de dominio aún no están implementados.

## Stack

Node 20 (CI) · pnpm 9.15.0 · Turborepo 2.11 · TypeScript 5.9 · NestJS 10.4 · React 18.3 · Vite 6.4 · Tailwind 3.4 · TanStack Query 5 · Socket.io 4.8 · PostgreSQL 16 · Prisma · RabbitMQ 3. Detalle: [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-stack-con-versiones).

## Comandos (verificados desde la raíz del repo)

```bash
corepack enable pnpm                 # si `pnpm` no está en PATH; turbo lo necesita como binario
pnpm install --frozen-lockfile       # instalar (igual que CI)
docker compose up -d                 # Postgres :5432 + RabbitMQ :5672 / UI :15672 (no verificado aquí: requiere Docker)
pnpm dev                             # web http://localhost:3000 + api http://localhost:3001 (watch)
pnpm build                           # build de shared → api + web (incluye `tsc` de web)
pnpm lint                            # ⚠ placeholder `echo` en los 3 paquetes
pnpm test                            # ⚠ placeholder `echo` en los 3 paquetes
pnpm --filter @floor/shared build    # recompilar contratos tras editarlos (apps consumen dist/)
pnpm --filter @floor/api exec tsc --noEmit -p tsconfig.json   # typecheck API
pnpm --filter @floor/web exec tsc --noEmit                    # typecheck web (requiere shared compilado)
pnpm turbo run build lint test --force                        # ignorar caché de turbo
```

- **Formato:** no hay formateador configurado (ni Prettier ni ESLint). Respeta el estilo existente: 2 espacios, comillas simples, punto y coma, comas finales.
- Lint/test reales son deuda técnica (DT-01). Si los configuras, pide confirmación antes (ver Límites).

## Mapa de directorios

| Ruta | Contenido |
|---|---|
| `apps/api/src/` | NestJS. Planificado: `modules/{mesas,reservas,uniones,espera}`, `events/`, `gateways/` |
| `apps/web/src/` | React. Planificado: `views/`, `components/`, `hooks/` |
| `packages/shared/src/` | `enums/`, `interfaces/`, `events/` (`EVENT_TOPICS` + payloads). Única fuente de contratos |
| `docs/` | Fuente de dominio, guía visual y ADR formal (fuente de verdad humana) |
| `agents/` | REQUIREMENTS, SPEC, ARCHITECTURE y este archivo |
| `.github/workflows/ci.yml` | CI: install → lint → build → test |
| `docker-compose.yml` | Infra local |

## Convenciones (no cubiertas por linter)

**Contratos y dominio**
- Enums, interfaces, payloads de eventos y routing keys viven **sólo** en `@floor/shared`. Nunca redefinirlos en `api` o `web`.
- Publica eventos usando `EVENT_TOPICS.*`, nunca strings literales.
- Vocabulario de dominio en español (`Mesa`, `Reserva`, `estadoFisico`). Valores de enum exactos: `'Limpieza pendiente'`, no `'LIMPIEZA'`.
- API y eventos en `camelCase`; columnas de BD en `snake_case`.
- Cita los IDs de reglas/requisitos en tests y PRs (`RN-09`, `RF-012`) para trazabilidad.

**Backend**
- Reglas de negocio en servicios, no en controllers. Un módulo NestJS por subdominio.
- Operaciones multi-fila (ocupar, unir, liberar, reasignar) en una sola transacción.
- Eventos sólo después del commit (vía outbox, ADR-006). Nunca publicar si hubo rollback.
- Traduce violaciones de restricciones de BD (`EXCLUDE`, `UNIQUE`) a 409 con código de dominio; nunca 500.
- Sala **no** cambia el estado de mesas por eventos externos (`PagoCompletado`) ni persiste `DiningSession`.
- Usa `Logger` de Nest, no `console.log`. Fechas como `timestamptz` en UTC.

**Frontend**
- Obligatoria la [guía visual v2.0](../docs/guia-visual-componentes.md): tokens de color, radios `8px`/`12px`, controles `h-10`.
- No crear sidebar/topbar (pertenecen al Shell) ni estilos globales sobre `body`, `button`, etc.
- Estados siempre con dot + texto; una sola acción primaria por bloque; botones con "Verbo + Objeto".
- Cada vista cubre loading (skeleton), vacío y error.
- Datos remotos con TanStack Query; los eventos Socket.io sólo invalidan queries.

**Flujo Git y ramas**
- Cada tarea se desarrolla en una rama propia derivada de `main` actualizada: `git checkout -b <tipo>/<ID>-<nombre-corto>`. Nunca commitear directo en `main`.
- Nomenclatura: `feat/BE-001-crud-mesas`, `chore/SH-001-tooling-calidad`, `fix/BE-002-transicion-mesas`.
- Pull Requests dirigidos a `main` vinculando el issue correspondiente (`Closes #1`). CI en verde obligatorio.

## Límites

**Prohibido**
- Editar `pnpm-lock.yaml` a mano o cambiar `packageManager`.
- Commitear `.env`, credenciales o secretos.
- `git push --force`, push directo a `main`, reescribir historial publicado.
- Borrar volúmenes o datos (`docker compose down -v`, `DROP`, editar migraciones ya aplicadas).
- Hacer que Sala consuma eventos de otros servicios o acceda a sus bases de datos.

**Requiere confirmación humana**
- Modificar `docs/` (fuente de verdad del equipo) o `.github/workflows/`.
- Agregar, quitar o actualizar dependencias.
- Cambios incompatibles en `@floor/shared/events` (afectan a Cocina y Pagos).
- Resolver preguntas abiertas pendientes de [REQUIREMENTS.md §10.2](./REQUIREMENTS.md#102-preguntas-abiertas-pendientes) (roles y cabeceras exactas de Auth/Gateway).
- Implementar algo marcado **(Propuesto)** en SPEC/ARCHITECTURE que contradiga `docs/`.
- Configurar ESLint, Prettier o runners de pruebas por primera vez.

## Definición de terminado

1. `pnpm build`, `pnpm lint` y `pnpm test` en verde desde la raíz (lo mismo que CI).
2. Typecheck limpio en `api` y `web` (comandos arriba).
3. Lógica nueva con pruebas que cubren los criterios del flujo en [SPEC.md §7](./SPEC.md#7-flujos); si aún no hay runner, indícalo explícitamente en el PR.
4. Contratos cambiados → `@floor/shared` actualizado y recompilado; SPEC actualizado.
5. UI nueva → checklist §8 de la guía visual cumplido.
6. Sin `console.log`, código muerto ni TODOs sin ticket.
7. Commit con Conventional Commits (patrón del historial): `tipo(scope): descripción` en imperativo.
   Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `ci`, `chore`. Scopes: `api`, `web`, `shared`, `ci`, `docs`.
   Ej.: `feat(api): add mesa ocupation endpoint`, `fix(shared): export EstadoUnion`.

## Cuándo leer cada documento

| Si vas a… | Lee |
|---|---|
| Entender qué se debe construir, prioridades, alcance o métricas | [REQUIREMENTS.md](./REQUIREMENTS.md) |
| Verificar si algo está fuera de alcance | [REQUIREMENTS.md §3.2](./REQUIREMENTS.md#32-excluido-explícitamente) |
| Consultar decisiones pendientes antes de implementar | [REQUIREMENTS.md §10](./REQUIREMENTS.md#10-preguntas-abiertas) |
| Implementar un endpoint, DTO o código de error | [SPEC.md §1 y §5](./SPEC.md#5-contratos-de-interfaz-rest) |
| Modelar entidades, migraciones o restricciones | [SPEC.md §2](./SPEC.md#2-modelo-de-datos) |
| Aplicar reglas de negocio o transiciones de estado | [SPEC.md §3 y §4](./SPEC.md#3-reglas-de-negocio) |
| Publicar/consumir eventos o WebSocket | [SPEC.md §6](./SPEC.md#6-contratos-asíncronos) |
| Escribir pruebas de un flujo | [SPEC.md §7](./SPEC.md#7-flujos) + [ARCHITECTURE.md §11](./ARCHITECTURE.md#11-estrategia-de-pruebas) |
| Crear carpetas, módulos o elegir dónde va el código | [ARCHITECTURE.md §3 y §5](./ARCHITECTURE.md#5-estructura-de-directorios) |
| Tocar persistencia, auth, logs o despliegue | [ARCHITECTURE.md §7–§10](./ARCHITECTURE.md#7-persistencia) |
| Proponer una decisión técnica nueva | [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-decisiones-de-diseño-adr) |
| Arreglar deuda técnica | [ARCHITECTURE.md §13](./ARCHITECTURE.md#13-deuda-técnica-conocida) |
| Diseñar o revisar UI | [docs/guia-visual-componentes.md](../docs/guia-visual-componentes.md) |
