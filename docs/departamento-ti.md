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
- **Cola del gate:** uno a la vez; la PC es el cuello de botella (cada worktree trae su `node_modules`).

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
