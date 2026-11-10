# Departamento de TI

Cómo trabaja el equipo de agentes. Gastón habla con un solo chat: ese chat es el **Jefe de TI** (Product Owner delegado, Scrum
Master y quien despacha). Gastón decide el qué y la prioridad; un sí por meta de sprint. Los demás roles son subagentes.

## Plantel

Un archivo por rol en `.claude/agents/ti-*.md` (lo único de `.claude/` que se versiona). Los subagentes son **planos**: no
lanzan otros, así que no hay mandos medios; el despacho pasa siempre por el Jefe. Un rol nuevo aparece como `subagent_type` al
reabrir la sesión; antes, se lanza `general-purpose` con «Rol: leé `.claude/agents/ti-x.md`».

| Agente | Modelo | Trabajo |
|---|---|---|
| `ti-tech-lead` | opus | Refina cards, estima, declara los archivos que toca cada una y revisa el diseño del código. Sólo lectura. |
| `ti-frontend` | opus (sonnet o haiku si es mecánico) | Pantallas y componentes con Tailwind y tokens; varias instancias a la vez. |
| `ti-diseno` | opus | `/playground` primero, paleta, crítica con `impeccable` y la pasada anti-IA. |
| `ti-contenido` | opus | Copy es/en en voseo, Novedades, microcopy, notas del parche. |
| `ti-qa-prod` | sonnet | Escribe y corre los E2E de Playwright contra producción, triagea fallas y abre cards Expedite. |
| `ti-release` | sonnet | Corre el gate una vez por PR, abre la PR, mergea, suma la entrada de Novedades y espera el deploy. |
| `ti-explorador` | sonnet | Auditorías y lectura de código con graphify. |

**Contratar:** si una card necesita un rol que no existe, el Jefe escribe `ti-<rol>.md` (propósito, modelo, herramientas,
qué archivos posee, cuándo está listo), suma su fila acá y se lo cuenta a Gastón. Un rol sin cards durante dos sprints se
retira. **Fable** se sugiere, no se usa solo: el caso (bug que ya falló dos intentos, cambio que cruza capas, decisión difícil
de revertir, revisión de seguridad) se le propone a Gastón con la razón en una línea y se espera su sí.

## Sin tope de agentes: qué lo regula

- **WIP por columna,** no por agente: empieza en 6 cards «En curso» y sube mientras el tiempo de ciclo no empeore y el gate no
  tenga cola.
- **Candados de archivos:** cada card declara qué toca; dos cards con rutas que se pisan no corren a la vez (la segunda queda
  «Bloqueada: espera TI-0xx»). Puntos calientes: `src/index.css`, `DeckModeScreen.tsx`, `vercel.json` y las áreas de `src/i18n`.
- **Cola del gate:** uno a la vez; la PC es el cuello de botella. Para no instalar 260 MB por worktree, todos enlazan (junction)
  `node_modules` a una carpeta **fuera de cualquier worktree** (`npm ci` ahí). En Windows, `git worktree remove` (sobre todo
  con `--force`) sigue el junction y vacía el destino compartido: **antes** se suelta el enlace desde PowerShell
  (`[IO.Directory]::Delete('<wt>\node_modules', $false)`; `cmd //c rmdir` desde Git Bash falla en silencio), se comprueba con
  `Test-Path` que ya no está y sólo entonces se quita el worktree. `gh pr merge --delete-branch` se corre desde el worktree
  de la propia rama (desde otro, borra el de la rama).
- **Novedades:** `src/data/novedades.json` (es y en) lleva una entrada por cada cambio visible, escrita por quien lo mergea
  con las mismas notas del parche; `novedades.test.ts` valida paridad, ids y fechas.

## Tablero: Scrum + Kanban

- **Sprint:** una meta y las cards que la cumplen, hasta 7 días. Planning: el Jefe propone y Gastón aprueba. Daily: el
  dashboard, sin ritual. Review: capturas y notas del parche. Retro: el Jefe ajusta reglas y memoria en 5 líneas.
- **Columnas:** Entrada → Refinada → Lista → En curso → Revisión (código y diseño) → Gate → Mergeada → QA producción → Hecha;
  carriles **Expedite** (lo roto en producción) y **Bloqueada**. Hecha = mergeada **y** verificada en producción.
- **Card:** `.claude/ti/cards/TI-NNN.md`, local y sin subir (no es un diario). Lleva tipo, título, historia, criterios de
  aceptación que QA pueda convertir en E2E, tamaño S/M/L (la escala del roadmap), rol, archivos que toca, depende de, PR,
  resultado de QA y nota del parche. **Sólo el Jefe mueve cards:** los agentes no las escriben, así no hay carreras.
- **Lo durable** (épicas y «Próximo») sigue en `docs/roadmap.md`, que el Jefe sincroniza al cerrar cada sprint. La verdad está
  en el tablero y no en el chat, que se compacta.
- **El reporte a Gastón** dice hecho, en curso y bloqueado, con a lo sumo 3 decisiones pendientes.

## Pruebas: una capa antes de mergear y QA en producción

- **Capa única, `npm run gate`** (`scripts/ti/gate.mjs`): la corre `ti-release` **una vez** por PR sobre el último commit. Los
  archivos salen de `origin/main...HEAD` más lo sin commitear. En orden y cortando en el primer rojo: `typecheck`, `eslint` (sólo
  lo cambiado), `vitest related` más las guardas baratas (docs, tailwind-only, licencia, site-meta, vercel-headers e i18n;
  `playground`, `src/index.css` y el relay sólo si cambió su zona) y el `build` sin el `tsc` que el typecheck ya cubre. Meta: ≤ 2 min.
  Uno solo a la vez en toda la PC (`.claude/ti/gate.lock`, con cola de hasta 15 min). `--dry` muestra el plan; `GATE_BASE` cambia
  la base del diff.
- **Node:** vitest pide ≥ 22.22 (con 22.14 cae `i18n.test.tsx`). Si el de la PC es más viejo, el gate usa el de
  `.claude/ti/config.json` (`{"node": "<ruta a node>"}`, local: el repo es público).
- **Mientras se itera,** sólo el test del archivo que se toca. La suite completa corre en `ci.yml`; `test:auto` sigue aparte.
- **QA en producción** (`npm run test:prod`, `playwright.prod.config.ts`, `e2e/prod/`): smoke de sólo lectura contra el sitio
  publicado, en celular (390×844, con toque) y en escritorio (1440×900), con User-Agent `YGOUltraLab-QA`. Cubre la portada sin
  errores de consola ni respuestas ≥ 400 propias, el armador con un deck sembrado, el Lab («de cada 100»), Solo, Tier lists,
  Banlists, el lobby de Online (sólo `GET /rooms`) y `/playground`. El catálogo de YGOPRODeck se responde vacío: no se le pega en
  cada corrida. **Nunca** crea salas ni envía formularios; la única sala (privada, con código al azar y cerrada al final) es la de
  `npm run test:prod:noche` (`@noche`), que el smoke deja afuera. **Todos los días** (09:30 UTC, sin la PC) lo corre todo
  `.github/workflows/e2e-prod.yml`: si algo cae abre o comenta un issue `qa-prod-fallo` y, cuando vuelve a pasar, lo cierra.
- **Después de cada deploy:** `EXPECT_SHA=<commit> npm run test:prod` espera hasta 10 min a que `/build.json` (lo escribe cada
  build) sirva el commit mergeado. Una repetición por caso; si sigue rojo, card Expedite con traza y captura (`test-results/`) y,
  si falla lo crítico (portada, armador, Lab, Solo) dos veces seguidas, **el Jefe revierte el último merge** con una PR y le avisa
  a Gastón. `npm run test:e2e` (el duelo con relay y Vite locales) es otra cosa y no cambia.
- **Revertir:** `git revert -m 1 <merge>` en una rama desde `origin/main`, gate, PR y merge desde su worktree, y el smoke con
  `EXPECT_SHA`. Simulado con el merge de una card de prueba: aplicó sin conflictos y el gate dio verde en 58 s (el camino
  completo, con deploy y smoke, ronda los 7 min).

## Dashboard

`/ti` existe sólo en `npm run dev` (nunca en el build) y es de sólo lectura. Los hooks de `SubagentStart`, `SubagentStop`,
`PreToolUse` y `PostToolUse` llaman a `tools/ti/log-event.mjs`, que agrega líneas a `.claude/ti/events.jsonl` (el contrato:
`.claude/ti/contrato-eventos.md`; nunca guarda contenido y tapa los secretos); `/api/ti/state` las reduce con las cards y la
pantalla pregunta cada segundo: meta del sprint, Pendiente de Gastón, cola del gate, último QA, una tarjeta por agente y el
tablero con su WIP. `TI_DIR` mueve la carpeta para simular. **En otra PC:** copiar a `.claude/settings.local.json`, dentro de
`hooks`, cada uno de esos cuatro eventos con
`[{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/tools/ti/log-event.mjs\"", "timeout": 5 }] }]`.

## Reglas de todos los agentes

- La card es el brief: leela entera. Si te hace falta tocar un archivo que no declara, frená y avisá.
- Trabajás en el worktree que te indican, con la rama desde `origin/main`. **No hacés push, PR ni merge:** eso es de
  `ti-release` y del Jefe. Dejá el commit local hecho.
- Mientras iterás, sólo el test del archivo que tocás. **Al cerrar no corrés suites:** el gate es de `ti-release`. Un mismo
  test que falla o se comporta distinto dos veces: frená y reportá (qué test, qué dice, qué probaste).
- Tailwind sin CSS propio, tokens, `docs/design-system.md`. Repo público: sin secretos, mails ni datos personales; sin imágenes
  de Konami; sin atribución a Claude en commits ni PR.
- graphify antes del primer grep sobre código (`CLAUDE.md`).
- **Reporte quirúrgico:** qué hiciste o encontraste, `archivo:línea`, decisiones y por qué, riesgos y lo que dejaste afuera.
  Sin volcar archivos ni logs.
