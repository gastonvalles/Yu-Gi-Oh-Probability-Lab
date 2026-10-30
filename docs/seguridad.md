# Seguridad

Un sitio sin cuentas ni base de datos: lo del usuario vive en su navegador y el cliente no tiene secretos. Se cuida lo que se
*carga* (código y datos de terceros), lo que se *recibe* (el otro jugador, un enlace) y lo que se *publica*.

## Defensas y dónde viven

- **Los encabezados** (`vercel.json`, fijados por `vercel-headers.test.ts`): CSP estricta en producción (sólo scripts propios,
  sin `unsafe-inline` ni `unsafe-eval`; `wasm-unsafe-eval` sólo para el núcleo del duelo automático; el único WebSocket es el
  relay) más los de aislamiento y referer. HSTS lo pone Vercel.
- **El código:** sin `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni `postMessage` entre páginas; enlaces externos con
  `rel="noreferrer"`. Lo guardado se lee con validación (`persistence.ts`), un deck importado tiene topes y la copia de
  seguridad sólo escribe claves de la app, sin la mesa de un duelo (`backup.ts`).
- **El otro jugador es un dato no confiable:** todo mensaje pasa por `parseMessage` (`duel-protocol.ts`), que devuelve una copia
  con forma conocida o `null`; un id de carta sólo vale con las formas que de verdad viajan (un `constructor` o `__proto__`
  como clave devolvería algo heredado). Nombres y chat, sin controles ni marcas que esconden el texto (`stripHidden`); los
  ajustes los fija el anfitrión; las jugadas del rival guardadas para deshacer tienen tope (`MAX_MIRROR_ACTS`: una ráfaga no
  congela a nadie), y una carta secreta nunca viaja: ids opacos y sólo lo que el rival puede ver (`mat-public.ts`). En el duelo automático por enlace sólo el deck del invitado (`autoDeck`, con tope de frecuencia)
  hace bajar datos al anfitrión, y en pleno duelo no baja nada.
- **Un combo o un replay compartido también es de otro** (`combo-share.ts`, `duel-replay-share.ts`): viaja en el hash
  (`#combo=`, `#replay=`; nunca al servidor) en un sobre versionado; se topa el largo antes de decodificar y la descompresión
  (una bomba se corta), y se copian sólo los campos conocidos, con tipos, rangos e ids con su patrón. El replay no lleva la
  clave del duelo, las respuestas del núcleo ni el chat, y lo propio oculto sólo va con «Incluir mi mano». Lo que no entra en
  un enlace va como video; no se lee ningún archivo de combo ni de duelo.
- **El proxy de imágenes** (`api/card-image.ts`): sólo rutas con la forma de una imagen de YGOPRODeck, host fijo, sin seguir
  redirecciones, sólo `path` y `w`, sólo JPEG, PNG o WebP con tope de bytes y de píxeles, y `same-origin` (nadie lo usa como
  su CDN).
- **Las transmisiones en vivo** (`api/live.ts`): sólo los canales de `LIVE_CHANNELS`, ningún parámetro del pedido llega a
  YouTube, tope de tiempo y de tamaño, y la app valida lo que vuelve (`parseLiveResponse`).
- **Los datos del duelo automático** (`api/auto-data.ts`): sólo lee lo que armó el build; un script se pide por nombre, que es
  una clave del índice y nunca una ruta del disco, y los códigos de carta tienen forma y tope.
- **El relay** (`duel-relay/`): sólo los orígenes de `ALLOWED_ORIGINS`, códigos de sala al azar (8 símbolos, unos 40 bits),
  topes de tamaño y de ritmo, binarios prohibidos a los jugadores (los avisos del relay no se falsifican) y espectadores que no
  mandan nada; no registra mensajes, códigos ni direcciones. Los números, en `docs/duelo-relay.md`.
- **La cadena de suministro:** las acciones de GitHub, fijadas por commit, con `persist-credentials: false` y el token sólo en
  el paso del `git push`; `.npmrc` con `ignore-scripts=true` y Dependabot semanal para npm y Actions.

## Lo que sólo hace quien administra las cuentas

1. **Verificación en dos pasos** (mejor con llaves de acceso) en GitHub, Vercel y Cloudflare: quien entra a una puede publicar
   código.
2. **Cloudflare:** una regla de límite por IP sobre `/room/*` (WAF → Reglas de límite), para que nadie abra salas a montones.
3. **Vercel:** una regla del Firewall que limite por IP `/api/card-image` (y «Attack Challenge» mientras dure un abuso), y
   Deployment Protection para que las vistas previas no sean públicas.
4. **GitHub:** en «Code security», el escaneo de secretos con protección de push y el aviso privado de vulnerabilidades.
5. Revisar cada tanto las integraciones y los tokens de las tres cuentas y revocar lo que no se use.

## Límites aceptados

- **El relay ve lo que pasa por él:** `wss://`, pero no de punta a punta; quien lo administre podría leer jugadas, vidas y chat
  (las cartas secretas no viajan en claro).
- **Quien tiene el código de sala entra** (no hay cuentas); con dos jugadores adentro, el resto queda afuera o mira.
- **El enlace de espectador es el mismo código:** quien lo use sin el modo espectador puede ocupar el lugar de un jugador que se
  cayó. Evitarlo pide un secreto por jugador, y eso rompe volver recargando: se aceptó para no perder un duelo por un corte.
- **El azar del duelo automático por enlace:** la baraja y el núcleo salen de una clave de 256 bits del anfitrión, pero el RNG
  del núcleo (xoshiro256**) no es criptográfico: lo que se ve da pocos bits por duelo, la misma exposición que EDOPro. El anfitrión ve todo (corre el núcleo): es «entre amigos».
- **`style-src 'unsafe-inline'`:** React escribe estilos en línea y sin eso la interfaz se rompe; no permite ejecutar scripts.
- **Los scripts de efectos:** los del duelo automático están fijados por commit (`auto-data.lock.json`, que actualiza una PR
  del workflow) y corren dentro del núcleo; los de la capa 1 (`npm run sync:effects`) se bajan de la rama principal sin fijar
  y sólo se leen como datos: un cambio malicioso mostraría efectos incorrectos hasta que se note.
- **Los datos de terceros** (meta, precios, banlists, replays) se dibujan como texto y las direcciones se arman con ids
  validados, pero un dato envenenado puede mostrar información incorrecta hasta que alguien lo note.

Un problema de seguridad se le avisa directo a quien administra el repositorio (`SECURITY.md`), sin abrir un issue público.
