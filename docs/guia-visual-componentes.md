# Guía Visual de Componentes — FMAT-RESTAURANT (v2.0)

> **Documento de Referencia UI/UX para Microservicios y Frontends**  
> **Propósito:** Esta guía estandariza la interfaz visual y la experiencia de usuario de todos los microservicios y frontends del ecosistema gastronómico FMAT (Sala/Floor, Pedidos/POS, Cocina/KDS, Catálogo/Inventario, etc.). Cualquier agente o desarrollador que implemente vistas o componentes debe ceñirse rigurosamente a estos lineamientos y tokens.

---

## 1. Filosofía y Principios de Diseño

El diseño de la plataforma se rige por cuatro principios fundamentales:

1. **Minimalista:** Pocos elementos ornamentales; el contenido y la legibilidad son los protagonistas.
2. **Claro:** Jerarquía visual inequívoca, tipografía legible y estados del sistema evidentes en todo momento.
3. **Consistente:** Mismos colores, mismos radios, mismas alturas y mismas convenciones en todos los módulos.
4. **Fácil de implementar:** Basado en tokens estándar, clases utilitarias y componentes modulares repetibles.

### Arquitectura de Integración (Shell vs. Módulos)
- **El Shell Global comparte la navegación:** La barra de navegación lateral/superior y la autenticación pertenecen a la capa contenedora o shell.
- **Cada equipo / microservicio entrega el contenido de su módulo:** Ningún microservicio debe reinventar barras de navegación completas, encabezados duplicados ni inyectar estilos globales que afecten a otros módulos.

---

## 2. Tokens de Diseño (Design Tokens)

### 2.1. Paleta de Color

| Token | Valor Hex | Rol y Uso Principal | Equivalente Tailwind aproximado |
| :--- | :--- | :--- | :--- |
| `primary` | `#C2410C` | Botones de acción principal, selección activa, llamadas a la acción (CTA) | `orange-700` |
| `primary-hover` | `#9A3412` | Estado hover y pressed de botones primarios | `orange-800` |
| `accent` | `#F97316` | Iconos activos, detalles secundarios, elementos de énfasis | `orange-500` |
| `soft` | `#FFF7ED` | Fondo suave para elementos seleccionados o contenedores destacados | `orange-50` |
| `ink` | `#111827` | Títulos principales (H1, H2, H3), textos de alta jerarquía | `gray-900` |
| `text` | `#374151` | Texto de contenido general, inputs, párrafos | `gray-700` |
| `muted` | `#6B7280` | Texto secundario, descripciones breves, fechas, placeholders | `gray-500` |
| `border` | `#E5E7EB` | Líneas de división, bordes de inputs, tarjetas y tablas | `gray-200` |
| `canvas` | `#F8FAFC` | Fondo general de la página / pantalla | `slate-50` |
| `surface` | `#FFFFFF` | Fondo de paneles, tarjetas (cards), modales y tablas | `white` |

#### Estados Semánticos (Badges y Puntos Indicadores)
Cada estado se representa siempre con **indicador visual (punto/dot) + texto legible** para garantizar accesibilidad:
- **Éxito (Success):** Dot verde (`#10B981` / `bg-emerald-500`), fondo suave opcional `bg-emerald-50 text-emerald-800`.
- **Advertencia (Warning):** Dot ámbar (`#F59E0B` / `bg-amber-500`), fondo suave opcional `bg-amber-50 text-amber-800`.
- **Error (Danger):** Dot rojo (`#EF4444` / `bg-red-500`), fondo suave opcional `bg-red-50 text-red-800`.
- **Información (Info):** Dot azul (`#3B82F6` / `bg-blue-500`), fondo suave opcional `bg-blue-50 text-blue-800`.
- **Seleccionado (Selected):** Dot naranja (`#C2410C`) con fondo `soft` (`#FFF7ED`).

#### Regla de Distribución de Color (70 - 20 - 10)
Para mantener la armonía visual sin sobrecargar:
- **70% Blanco y fondos neutros:** `canvas` (`#F8FAFC`) y `surface` (`#FFFFFF`).
- **20% Estructura, textos y bordes:** `ink` (`#111827`), `text` (`#374151`), `muted` (`#6B7280`) y `border` (`#E5E7EB`).
- **10% Naranja y estados semánticos:** `primary` (`#C2410C`), `accent` (`#F97316`) y colores de estado.

> ⚠️ **Idea clave:** El color naranja guía la atención visual del usuario hacia la acción principal. **NO** se debe usar naranja como fondo de cada card ni para decorar la pantalla entera. **NUNCA** usar rojo como color primario corporativo (el rojo está reservado estrictamente para eliminación y errores).

---

### 2.2. Tipografía

- **Familia principal:** `Inter`
- **Pila de fallback:** `Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`

#### Escala Tipográfica

| Nivel | Tamaño (px) | Interlínea (Line Height) | Peso (Font Weight) | Uso Recomendado |
| :--- | :--- | :--- | :--- | :--- |
| **H1** | `28px` (`1.75rem`) | `36px` (`2.25rem`) | 700 (Bold) | Título principal de pantalla o módulo |
| **H2** | `22px` (`1.375rem`)| `30px` (`1.875rem`) | 700 (Bold) | Títulos de sección o panel principal |
| **H3** | `18px` (`1.125rem`)| `26px` (`1.625rem`) | 600 (Semi-bold) | Título de tarjetas, modales o componentes |
| **Body** | `16px` (`1rem`) | `24px` (`1.5rem`) | 400 (Regular) | Texto de interfaz general, lectura estándar |
| **Small** | `14px` (`0.875rem`)| `20px` (`1.25rem`) | 400 (Regular) | Textos auxiliares, fechas, metadatos, tablas |
| **Caption**| `12px` (`0.75rem`) | `16px` (`1rem`) | 400 (Regular) | Microetiquetas, badges, notas al pie |

**Regla de pesos:**
- `400` para texto corrido y contenido.
- `600` / `700` para jerarquía, títulos y énfasis.

---

### 2.3. Espaciado y Cuadrícula

La escala de espaciado se basa en múltiplos de **4px** (`--space-unit: 4px`):
- `4px` (`p-1`, `gap-1`): Espaciado mínimo entre iconos y texto compacto.
- `8px` (`p-2`, `gap-2`): Espaciado interno de controles compactos y badges.
- `12px` (`p-3`, `gap-3`): Separación entre campos y grupos pequeños.
- `16px` (`p-4`, `gap-4`): Padding estándar de tarjetas y contenedores de formularios.
- `24px` (`p-6`, `gap-6`): Padding amplio para contenedores y separación entre bloques.
- `32px` (`p-8`, `gap-8`): Margen entre secciones mayores.
- `48px` (`p-12`, `gap-12`): Separaciones estructurales principales.

---

### 2.4. Radios de Borde (Border Radius)

| Token | Medida | Clase Tailwind | Aplicación |
| :--- | :--- | :--- | :--- |
| `radius-sm` | `4px` | `rounded` | Badges pequeños, tags compactos |
| `radius-control` | `8px` | `rounded-lg` | Botones, inputs, selects, textareas, checkboxes |
| `radius-card` | `12px` | `rounded-xl` | Cards, paneles, modales, alertas y contenedores |

---

### 2.5. Alturas de Controles e Interactividad

- **Controles estándar (Desktop/Tablet):** Altura fija de `40px` (`h-10`).
- **Controles táctiles / Mobile:** Altura recomendada de `48px` (`h-12`) o un área táctil mínima de `44px × 44px`.
- **Botón solo icono:** Tamaño mínimo de `40px × 40px` (`w-10 h-10`).

---

### 2.6. Sombras y Elevación

- **Estilo:** Sombra extremadamente sutil (`shadow-sm`) o casi imperceptible.
- **Regla:** La delimitación de superficies se realiza mediante el borde gris fino (`border border-[#E5E7EB]`). La sombra se reserva únicamente para separar capas flotantes (modales, dropdowns y popovers).

---

## 3. Catálogo de Componentes

### 3.1. Botones

**Regla de diseño:** Misma altura, mismo radio (`8px`) y **una sola acción principal por bloque o sección**.

#### Variantes

1. **Primario (Acción Principal):**
   - Fondo: `#C2410C` (`bg-primary`)
   - Hover: `#9A3412` (`bg-primary-hover`)
   - Texto: `#FFFFFF` (`text-white`), font-weight 500/600
   - Uso: Guardar cambios, Enviar comanda, Cobrar cuenta, Agregar.
2. **Secundario (Alternativa Visible):**
   - Fondo: `#FFFFFF` o transparente
   - Borde: `1px solid #E5E7EB` (o borde fino de color `#C2410C`)
   - Texto: `#374151` o `#C2410C`
   - Uso: Vista previa, Filtrar, Ver detalles.
3. **Terciario (Baja Prioridad / Ghost):**
   - Fondo: Transparente
   - Borde: Sin borde
   - Texto: `#6B7280` con hover en `#111827`
   - Uso: Cancelar, Descartar.
4. **Destructivo (Acción Irreversible):**
   - Fondo: `#DC2626` / `#B91C1C` (`bg-red-600` / `hover:bg-red-700`)
   - Texto: `#FFFFFF`
   - Uso: Eliminar producto, Cancelar orden irreversible.
5. **Deshabilitado (Sin Interacción):**
   - Fondo: `#F3F4F6` (`bg-gray-100`)
   - Borde: `#E5E7EB`
   - Texto: `#9CA3AF` (`text-gray-400`), `cursor-not-allowed`

#### Tamaños de Botones
- `SM` (32px / `h-8`): Para filtros en barra de búsqueda o acciones compactas en tablas.
- `MD` (40px / `h-10`): Tamaño estándar para formularios, barras de acción y cards.
- `LG` (48px / `h-12`): Tamaño para botones principales de punto de venta (POS) o comanderas táctiles.

#### Reglas de UX y Copywriting para Botones
- **Disposición:** El botón primario se coloca a la **derecha**; el botón "Cancelar" o secundario se coloca a la **izquierda**.
- **Copywriting:** Fórmula `Verbo + Objeto`. Usar *"Cobrar cuenta"*, *"Guardar producto"* o *"Enviar a cocina"* en lugar de etiquetas genéricas como *"Aceptar"*.
- **Estado de Carga (Loading):** Deshabilitar el botón y mostrar spinner o indicador de carga para evitar doble envío accidental.
- **Uso del rojo:** Restringido exclusivamente para acciones destructivas/irreversibles.

---

### 3.2. Inputs y Formularios

**Regla de diseño:** Etiqueta siempre visible arriba, texto de ayuda breve y mensajes de error situados junto al campo afectado.

#### Estructura Estándar
1. **Label:** Texto visible en peso 500 (`text-sm font-medium text-gray-700`), con asterisco rojo (`*`) para campos obligatorios.
2. **Input:** Altura `40px` (`h-10`), padding horizontal `12px` (`px-3`), radio `8px` (`rounded-lg`), borde `#E5E7EB`, fondo blanco.
3. **Texto de ayuda / Error:** Texto `12px` (`text-xs`) ubicado directamente debajo del campo.

#### Estados de Input
- **Default:** Borde `#E5E7EB`, fondo blanco.
- **Focus:** Anillo o borde de enfoque en color primario (`focus:border-[#C2410C] focus:ring-1 focus:ring-[#C2410C]`).
- **Error:** Borde rojo (`border-red-500 focus:border-red-500 focus:ring-red-500`) con mensaje explicativo en rojo abajo.
- **Deshabilitado / Solo Lectura:** Fondo `#F9FAFB`, texto `#9CA3AF`, cursor bloqueado.

#### Controles de Selección
- **Checkbox:** Caja redondeada `rounded` de `16px × 16px` con check blanco sobre fondo `#C2410C` cuando está marcado.
- **Radio Button:** Círculo exterior con punto central `#C2410C` cuando está seleccionado.
- **Toggle / Switch:** Contenedor de cápsula con deslizador blanco; track en naranja `#C2410C` al activarse y gris `#E5E7EB` inactivo.

#### Búsqueda y Select
- **Buscador (Search Input):** Icono de lupa a la izquierda, padding izquierdo ampliado (`pl-10`), esquinas `rounded-lg` o píldora suave.
- **Select:** Flecha chevron a la derecha (`appearance-none` con icono SVG), misma altura y padding que los inputs de texto.

#### Anti-Patrones a Evitar (Do Not)
- ❌ No utilizar el `placeholder` como reemplazo de la etiqueta (`<label>`).
- ❌ No vaciar o limpiar los datos del formulario si ocurre un error de red.
- ❌ No mostrar mensajes crípticos o genéricos como "Dato inválido" sin explicar exactamente cómo corregirlo.

---

### 3.3. Cards (Tarjetas)

**Regla de diseño:** Fondo blanco (`#FFFFFF`), borde fino `#E5E7EB`, esquinas de `12px` (`rounded-xl`), y sombra mínima o nula. **Sin franjas de color laterales gruesas ni degradados llamativos.**

#### Tipos de Cards

1. **Card de Producto (Catálogo / Menú):**
   - Imagen del producto con esquinas redondeadas y fondo suave (`#F8FAFC`).
   - Badge de estado superior o inferior (ej. punto verde + "Disponible").
   - Nombre del producto en `H3` (`font-bold text-gray-900`).
   - Descripción en 1 o 2 líneas (`text-sm text-gray-600 line-clamp-2`).
   - Precio destacado (`text-base font-bold text-gray-900` o naranja).
   - Botón de acción ("Agregar") en la base.

2. **Card Seleccionable (Órdenes / Mesas):**
   - Identificador en negrita (`Orden #2035`), datos secundarios (`Mesa 20 · 4 personas`), monto (`$230.00`) y badge de estado (`Pagada`, `Pendiente`).
   - **Estado Seleccionado:** Fondo suave naranja (`#FFF7ED`) + borde naranja (`#C2410C`).
   - **Estado No Seleccionado:** Fondo blanco (`#FFFFFF`) + borde neutro (`#E5E7EB`).

3. **Card de Métrica / Resumen (KPI):**
   - Etiqueta superior en mayúsculas pequeñas (`text-xs font-semibold uppercase tracking-wider text-gray-500`).
   - Valor numérico grande (`text-2xl font-bold text-gray-900`).
   - Métrica de tendencia (+8.4% verde) o texto secundario ("12 pendientes").
   - Botón o enlace de navegación opcional ("Ver pedidos").

4. **Card Horizontal (Lista de Pedido / Recetas):**
   - Miniatura pequeña a la izquierda (solo si aporta claridad).
   - Datos del producto / ítem al centro.
   - Cantidad, precio y menú de opciones (`...`) a la derecha.

---

### 3.4. Menús y Navegación

**Regla de diseño:** El shell del ecosistema aloja la navegación global. Cada microservicio entrega el contenido de su pantalla sin replicar la barra superior ni el menú principal.

#### Variantes de Navegación Lateral (Sidebar)
- **Modo Expandido (Desktop):**
  - Isotipo de la marca: círculo naranja con sigla "FMAT".
  - Enlaces con Icono + Texto (`Inicio`, `Catálogo`, `Pedidos`, `Usuarios`).
  - **Ítem Activo:** Fondo suave `#FFF7ED`, texto e icono en naranja `#C2410C`, peso `font-semibold`.
  - **Ítem Inactivo:** Texto e icono en gris `#6B7280`, hover en `#F3F4F6` con texto `#111827`.
- **Modo Compacto (Tablet / Pantallas medianas):**
  - Muestra únicamente los iconos centrados (botones de mínimo `40px × 40px`).

#### Pestañas (Tabs) y Filtros
- Pestañas horizontales simples ("Todos", "Disponibles", "Agotados").
- Pestaña activa: Texto `#C2410C` con línea indicadora inferior de `2px` en color `#C2410C`.
- Pestaña inactiva: Texto `#6B7280` sin línea.

#### Migas de Pan (Breadcrumbs)
- Separador de barra diagonal (`/`) o chevron.
- Formato: `Inicio / Inventario / Productos` con texto `text-sm text-gray-500` y último elemento en `text-gray-900 font-medium`.

#### Paginación
- Botones de número de página cuadrados o suavemente redondeados (`rounded-lg`).
- Página activa: Fondo `#C2410C`, texto blanco.
- Páginas inactivas: Borde `#E5E7EB`, texto `#374151`, hover `#F3F4F6`.

---

### 3.5. Tablas y Listas

**Regla de diseño:** Bordes ligeros, números alineados a la derecha y acciones secundarias encapsuladas en menús de tres puntos (`...`).

#### Estructura de Tabla
- **Encabezado (`<thead>`):** Fondo `#F9FAFB` o blanco, texto `text-xs font-semibold text-gray-500 uppercase tracking-wider`.
- **Alineación:**
  - Textos descriptivos y nombres: alineados a la **izquierda**.
  - Cantidades, precios, unidades numéricas: alineados a la **derecha**.
  - Estados (Badges) y acciones: centrados o alineados a la derecha.
- **Divisores:** Línea horizontal de `1px` en `#E5E7EB` entre filas. Evitar líneas verticales pesadas.
- **Barra de Acciones de Tabla:** Input de búsqueda rápida a la izquierda y botón de acción principal (`+ Agregar`) a la derecha.

#### Transformación Responsive
- En dispositivos móviles (`< 768px`), las tablas complejas **deben transformarse en una lista compacta de tarjetas**.
- Cada fila se convierte en una tarjeta independiente con el título/nombre a la izquierda, estado a la derecha y monto al pie.

---

### 3.6. Estados, Mensajes y Modales

**Regla de diseño:** El usuario siempre debe saber con exactitud qué ocurrió, qué está procesando el sistema y qué acción puede realizar a continuación.

#### Banners de Notificación / Mensajes de Estado
Formato tipo píldora o caja suave con borde, dot semántico y texto claro:
- **Éxito:** Fondo verde claro (`#ECFDF5`), dot verde, texto `text-emerald-800` ("Producto guardado correctamente.").
- **Advertencia:** Fondo ámbar claro (`#FFFBEB`), dot ámbar, texto `text-amber-800` ("Quedan 4 unidades en inventario.").
- **Error:** Fondo rojo claro (`#FEF2F2`), dot rojo, texto `text-red-800` ("No se pudo procesar el pago.").
- **Información:** Fondo azul claro (`#EFF6FF`), dot azul, texto `text-blue-800` ("Sincronizando cambios...").
- **Toast flotante:** Pequeño contenedor flotante blanco con sombra suave y badge de estado ("Cambios guardados").

#### Estados de Carga y Vacío (Loading & Empty States)
- **Carga (Loading):** Skeletons animados suaves en gris claro (`animate-pulse bg-gray-200 rounded`) que reflejen la forma de las cards o tablas que se cargarán.
- **Estado Vacío (Empty State):** Contenedor centrado con icono neutro dentro de un círculo suave, título descriptivo en H3 ("Aún no hay productos") y llamado a la acción primario ("Agrega el primero para comenzar").

#### Modales de Confirmación
- **Fondo (Backdrop):** Fondo oscuro semitransparente (`bg-black/50 backdrop-blur-sm`).
- **Contenedor:** Blanco, esquinas `12px` (`rounded-xl`), padding generoso (`p-6`), ancho máximo controlado (`max-w-md`).
- **Estructura:**
  1. Título conciso (`H2` o `H3`, ej. "Confirmar eliminación").
  2. Descripción clara del impacto: *"Se eliminará 'Hamburguesa clásica'. Esta acción no se puede deshacer."*
  3. Caja de advertencia suave opcional.
  4. Botonera inferior alineada a la derecha: Botón "Cancelar" (secundario) a la izquierda y botón de acción (ej. "Eliminar" en rojo destructivo) a la derecha.

---

## 4. Patrones Específicos del Restaurante

Estos componentes son piezas predefinidas para el dominio operativo del restaurante:

### 4.1. Card de Mesa (Plano / Floor / Sala)
- **Indicador de Estado:** Dot y texto en esquina superior izquierda:
  - Disponible: Dot verde + texto "Disponible".
  - Ocupada: Dot ámbar/naranja + texto "Ocupada".
  - Reservada: Dot azul + texto "Reservada".
  - Limpieza Pendiente: Dot amarillo + texto "Limpieza".
- **Identificador de Mesa:** Título grande en negrita (`Mesa 04`).
- **Metadatos Operativos:** Capacidad y tiempo transcurrido (ej. `4 personas · 32 min`).
- **Acción:** Botón secundario con borde naranja o primario ("Ver mesa").

### 4.2. Card de Comanda (KDS / Cocina)
- **Encabezado en bloque naranja (`#C2410C`):** Texto blanco con número de mesa, identificador de comanda y hora (`MESA 04 · #184` a la izquierda, `12:41` a la derecha).
- **Cuerpo de Pedido:**
  - Cantidad destacada en negrita a la izquierda (`2`, `1`, `3`).
  - Nombre del platillo en negrita (`Hamburguesa clásica`).
  - Modificadores y notas de cocina en texto secundario gris (`Sin cebolla · término 3/4`, `Aderezo aparte`).
- **Acción:** Botón inferior ancho al 100% de ancho: *"Marcar como lista"* (`bg-primary text-white`).

### 4.3. Cuenta y Recibo (POS / Checkout)
- **Encabezado:** Título `Cuenta #1234`, metadatos de mesa y fecha/hora (`Mesa 04 · 22/09/2026 · 18:45`).
- **Lista de consumo:** Desglose de partidas (`2 × Hamburguesa` con importe `$290.00` alineado a la derecha).
- **Total:** Fila destacada con palabra "Total" a la izquierda y monto final en negrita grande (`$498.00`) a la derecha.
- **Acción:** Botón ancho *"Cobrar cuenta"* en color primario naranja.

---

## 5. Estrategia Responsive y Breakpoints

El diseño es responsivo fluido: **los componentes se reacomodan inteligentemente en lugar de encogerse hasta volverse ilegibles**.

| Dispositivo | Rango de Ancho | Columnas | Comportamiento de Navegación y Layout |
| :--- | :--- | :--- | :--- |
| **Desktop** | `≥ 1200px` | 12 columnas | Sidebar expandida fija (icono + texto). Grids de contenido en 3 o 4 columnas. Tablas de datos completas. |
| **Tablet** | `768px – 1199px` | 8 columnas | Sidebar compacta (solo iconos de 40px). Grids de contenido en 2 columnas. |
| **Mobile** | `< 768px` | 4 columnas | **Sidebar oculta:** Navegación inferior fija (Bottom Nav Bar). Contenido en columna única (`1 col`). Tablas convertidas a listas compactas. Botones y controles en 48px para facilitar el tap táctil. |

---

## 6. Guía Rápida: Qué Hacer vs. Qué Evitar

### ✅ Lo que SÍ se debe hacer (Do's)
- Usar siempre los mismos tokens de diseño (colores, espaciados y radios).
- Permitir **una sola acción primaria** por bloque o tarjeta.
- Mantener las cards con fondo blanco y borde sutil de `1px` (`#E5E7EB`).
- Indicar los estados combinando **color + texto explicativo** (accesibilidad WCAG).
- Utilizar exclusivamente la escala de espaciado estándar: 4, 8, 12, 16, 24, 32 o 48 px.
- Validar siempre las interfaces en resoluciones de escritorio, tablet y móvil.
- Implementar estados de carga (skeletons), estados vacíos y feedback tras cada acción asíncrona.

### ❌ Lo que se debe EVITAR (Don'ts)
- ❌ **Inventar colores o radios:** No introducir otros tonos de naranja, rojos corporativos o radios exagerados.
- ❌ **Franjas laterales de color:** No pintar bordes gruesos de colores a los costados de las tarjetas.
- ❌ **Saturación visual:** No llenar la pantalla de contenedores decorativos sin propósito informativo.
- ❌ **Rojo como color de marca:** El color rojo se reserva estrictamente para acciones destructivas e incidencias críticas.
- ❌ **Ocultar labels:** Nunca sustituir la etiqueta de un campo por su placeholder.
- ❌ **Duplicar navegación:** No recrear la barra lateral o topbar dentro de los módulos individuales; respetar el shell compartido.

---

## 7. Tokens Técnicos para Implementación

### 7.1. Variables CSS Nativas (`tokens.css`)

```css
:root {
  /* Colores de Marca y Acción */
  --color-primary: #C2410C;
  --color-primary-hover: #9A3412;
  --color-primary-soft: #FFF7ED;
  --color-accent: #F97316;

  /* Colores de Superficie y Neutros */
  --color-ink: #111827;
  --color-text: #374151;
  --color-muted: #6B7280;
  --color-border: #E5E7EB;
  --color-canvas: #F8FAFC;
  --color-surface: #FFFFFF;

  /* Estados Semánticos */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;

  /* Radios */
  --radius-sm: 4px;
  --radius-control: 8px;
  --radius-card: 12px;

  /* Malla y Unidades */
  --space-unit: 4px;
  --control-height-md: 40px;
  --control-height-lg: 48px;
}
```

### 7.2. Configuración Recomendada de Tailwind CSS (`tailwind.config.js`)

Para asegurar que cualquier aplicación React/Vite en el monorepo implemente fielmente los estilos:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#C2410C',
          hover: '#9A3412',
          soft: '#FFF7ED',
        },
        accent: '#F97316',
        ink: '#111827',
        surface: '#FFFFFF',
        canvas: '#F8FAFC',
      },
      borderRadius: {
        control: '8px',
        card: '12px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
}
```

---

## 8. Checklist de Validación Pre-Entrega

Antes de dar por completada una vista, componente o microservicio frontend, el agente o desarrollador debe verificar:

- [ ] **Tokens respetados:** Se utilizaron los colores, bordes y fuentes de la guía sin valores arbitrarios "hardcodeados".
- [ ] **Componentes compartidos:** Se reutilizaron las variantes oficiales de botones, inputs y cards.
- [ ] **Estados cubiertos:** La pantalla gestiona explícitamente:
  - Estado de carga (Loading / Skeleton).
  - Estado vacío (Empty State).
  - Estado de error (Mensaje claro + acción para resolverlo).
- [ ] **Navegación e interacciones:** Teclado y foco visibles (`focus:ring-2`), botones deshabilitados durante peticiones.
- [ ] **Accesibilidad y táctil:** Controles con altura mínima de `40px` (y `44px-48px` en vistas móviles/touch).
- [ ] **Sin estilos globales invasivos:** La pantalla no modifica selectores HTML globales (`body`, `button`, etc.) que alteren otros módulos.
- [ ] **Comportamiento responsive verificado:** Probado en Desktop (12 cols), Tablet (8 cols) y Mobile (1 col con Bottom Nav).

---

## 9. Plantillas de Código Canónicas (React + Tailwind CSS)

Para maximizar la productividad y precisión de los agentes al generar componentes, a continuación se presentan las plantillas de referencia:

### 9.1. Botones Canónicos
```tsx
// Botón Primario
<button className="h-10 px-4 bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
  Guardar cambios
</button>

// Botón Secundario
<button className="h-10 px-4 bg-white border border-[#E5E7EB] hover:bg-gray-50 text-[#374151] text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2">
  Vista previa
</button>

// Botón Destructivo
<button className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2">
  Eliminar
</button>
```

### 9.2. Campo de Formulario (Input con Validación)
```tsx
<div className="flex flex-col gap-1.5">
  <label htmlFor="nombre" className="text-sm font-medium text-[#111827]">
    Nombre del producto <span className="text-red-500">*</span>
  </label>
  <input
    id="nombre"
    type="text"
    placeholder="Ej. Hamburguesa clásica"
    className="h-10 px-3 bg-white border border-[#E5E7EB] rounded-lg text-sm text-[#374151] placeholder:text-[#6B7280] focus:outline-none focus:border-[#C2410C] focus:ring-1 focus:ring-[#C2410C] transition-all"
  />
  <span className="text-xs text-red-600">Ingresa un valor válido.</span>
</div>
```

### 9.3. Badges de Estado con Dot
```tsx
// Estado Disponible (Verde)
<span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
  <span className="w-2 h-2 rounded-full bg-emerald-500" />
  Disponible
</span>

// Estado Ocupada / Pendiente (Ámbar)
<span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
  <span className="w-2 h-2 rounded-full bg-amber-500" />
  Ocupada
</span>

// Estado Agotado (Rojo)
<span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
  <span className="w-2 h-2 rounded-full bg-red-500" />
  Agotado
</span>
```

### 9.4. Card de Producto Canónica
```tsx
<div className="bg-white border border-[#E5E7EB] rounded-xl p-4 flex flex-col justify-between hover:border-gray-300 transition-colors">
  <div className="w-full aspect-square bg-[#F8FAFC] rounded-lg mb-3 flex items-center justify-center overflow-hidden">
    <img src="/placeholder-dish.png" alt="Hamburguesa" className="object-cover w-3/4 h-3/4" />
  </div>
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Disponible
      </span>
    </div>
    <h3 className="text-base font-bold text-[#111827]">Hamburguesa clásica</h3>
    <p className="text-sm text-[#6B7280] line-clamp-2 mt-1">Carne, queso, vegetales y pan artesanal.</p>
  </div>
  <div className="mt-4 pt-3 border-t border-[#E5E7EB] flex items-center justify-between">
    <span className="text-lg font-bold text-[#111827]">$145.00</span>
    <button className="h-9 px-3 bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-medium rounded-lg transition-colors">
      Agregar
    </button>
  </div>
</div>
```

### 9.5. Card Seleccionable (Órdenes / Mesas)
```tsx
interface SelectableCardProps {
  isSelected: boolean;
  orderNumber: string;
  tableInfo: string;
  amount: string;
  status: string;
  onClick: () => void;
}

export function SelectableCard({ isSelected, orderNumber, tableInfo, amount, status, onClick }: SelectableCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-all border ${
        isSelected
          ? 'bg-[#FFF7ED] border-[#C2410C]'
          : 'bg-white border-[#E5E7EB] hover:border-gray-300'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-bold text-[#111827]">{orderNumber}</h4>
          <p className="text-xs text-[#6B7280] mt-0.5">{tableInfo}</p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {status}
          </span>
          <p className="text-sm font-bold text-[#111827] mt-1">{amount}</p>
        </div>
      </div>
    </div>
  );
}
```

