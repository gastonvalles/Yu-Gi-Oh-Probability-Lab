# Retomar el trabajo desde otra PC

Para arrancar sin el chat ni la memoria de Claude de la PC anterior. Escrito el 2026-10-16, con `main` en el PR #267
(`455098a`). Es una foto: lo que cambió después está en `git log`.

## 1. Dónde quedó

- **Rediseño YGOUltraLab, en `main` y desplegado en Vercel** (el deploy de `455098a` terminó bien):
  - PR #266: el Comparador (cajones, tablero, VS).
  - PR #267: la paleta cerrada en tokens (`src/index.css`), el menú índigo con ámbar y 4 grupos (Tu deck · Duelo ·
    Herramientas · Descubrir), la barra de abajo del celular con sus hojas (`MobileTabBar`, `GroupSheet`), el cajón de
    ajustes, y la mesa del duelo: «Pasar turno», 🤔 y 👍 sin texto, el registro de jugadas junto al chat, el campo visto
    desde arriba (`--field-tilt`, `--field-perspective`) y las mascotas apagadas la primera vez en el celular.
- La fuente de diseño sigue siendo el **lienzo de prototipos** (sección 4). El código migra de a tandas.

## 2. Arrancar

```bash
git pull
npm ci                 # Node según .nvmrc
npm run dev            # http://localhost:5173
```

Cierre de cada tarea: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, más el chequeo responsive de
`docs/ux-ui-guidelines.md`. El CI corre esos cuatro.

Para probar un duelo en local hace falta la variable `VITE_DUEL_RELAY_URL` (un `.env.local`, ignorado por git) y un relay:
ver `docs/duelo.md` y `docs/duelo-relay.md`. El relay publicado sólo acepta los orígenes de Vercel.

## 3. Qué leer primero

1. `CLAUDE.md`, que trae `docs/ux-ui-guidelines.md`: cómo se lee un pedido de diseño y cómo se hace una mejora visual.
2. `docs/design-system.md` (componentes, tokens, reglas) y `docs/playground.md` (`/playground`, el catálogo vivo: todo
   cambio de diseño se prueba ahí primero).
3. `PRODUCT.md`: usuarios, propósito y tono.
4. `docs/duelo.md` (cómo funciona el duelo por enlace) y `docs/i18n.md` (es/en por `t()`).
5. `.impeccable/critique/`: las críticas de la herramienta Impeccable del 2026-10-16 (27/40 y los 3 P1).

## 4. El lienzo de prototipos

Publicado como artifact privado: <https://claude.ai/artifact/EDbqyjWAgvgRctJpastsF7> («Prototipos YGOUltraLab»). Se lee
con la misma cuenta de claude.ai (desde Claude Code: acción `read` del Artifact con esa URL, y `list` con `scope: "files"`
para ver las hojas). Es una hoja por pantalla o estado (`Mesa`, `MesaPerspectiva`, `Lab`, `Comparar`, `Lobby`, `Hoja*`,
`Paleta`, `Logo`…), en celular y en escritorio. Los fuentes locales (`*.dc.html`) vivían en una carpeta temporal de la PC
anterior y **no están en el repo**: la copia publicada es la que vale.

## 5. Decisiones que siguen en pie

- **Jugar solo** es una herramienta, no una sala.
- **Ámbar** sólo para la navegación, el rival y el build B. **Verde y rojo** sólo para estadísticas. El violeta es «Vos».
- **Mascotas apagadas** por defecto la primera vez en el celular.
- **Logo A** (anillo y carta) y el nombre **YGOUltraLab**.
- **Motion** (`motion`, motion.dev) está pensado para un motor chico y fluido: campo en perspectiva y arrastre. Se mantienen
  las animaciones 3D actuales de las cartas, pero más fluidas. No se agregó la dependencia: se suma cuando haya motor.
- Mensajes rápidos del duelo: sólo 🤔 (pensando) y 👍 (paso / todo bien), sin texto y al alcance del pulgar.
- La mano nunca se superpone a un menú.

## 6. Pendiente

Necesita decisión de Gastón antes de tocarse (cambia comportamiento o protocolo):

- **«Pasar turno» sin confirmación.** Un toque accidental le da el turno al rival, y deshacer le pide permiso a los dos.
  Hacerlo en una sola acción cambia el protocolo del relay.
- **Roles carta por carta** (cambia el flujo de clasificación).

Sin migrar todavía, pero decidido:

- El motor de arrastre y de vuelos con `motion` (empezar en `/playground` con un solo gesto).
- Lab y Comparar a nivel de pantalla, y las hojas con chips de estado vivo.
- «Mirar un duelo» como pantalla propia.
- Renombrar el resto de «Probability Lab» (`index.html`, i18n, README).
- La barra de abajo mide 64 px fijos (`TAB_BAR_PX`): con la letra del navegador agrandada puede quedar corta (`4rem`).
- De la revisión del #267 quedaron opcionales: el teclado que tapa la botonera y la escala inicial del vuelo fantasma.

## 7. Forma de trabajo acordada

- Español rioplatense (voseo) en todo lo que ve la gente y en los comentarios; el código en español como el resto.
- **Sin atribución a Claude** (ni `Co-Authored-By` ni créditos) en commits ni en PRs.
- Una rama y un PR por tanda, desde `origin/main`. **Se mergea sólo con el CI verde del último commit** de la rama (el job
  `check`), y cuando Gastón lo pide.
- Si hay otra sesión o PC tocando el mismo checkout, armá los PRs desde un `git worktree` aparte; con `node_modules` como
  junction al del repo (en Windows, con PowerShell `New-Item -ItemType Junction`).
- Tandas cortas (menos de 30 minutos) que se puedan mirar enseguida; verificar en el navegador a 390, 1100 y 1440 px.

## 8. Lo que no viaja con el repo

- **Skills y agentes de Claude** (`.claude/`, ignorado por git): `impeccable`, `motion`, `playwright-cli`. Sin ellas se
  trabaja igual; las críticas de `.impeccable/critique/` se leen como texto. `.mcp.json` declara el servidor MCP de Motion
  (el de Motion+ pide iniciar sesión).
- **La memoria de Claude** de la PC anterior (preferencias y notas de cada tanda): lo importante está en este documento.
- **`.env.local`** (ver sección 2).
