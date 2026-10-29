# Seguridad

Un sitio sin cuentas ni base de datos: lo del usuario vive en su navegador y el cliente no tiene secretos. Se cuida lo que se
*carga* (código y datos de terceros), lo que se *recibe* (el otro jugador del duelo) y lo que se *publica* (el repositorio y
sus despliegues).

## Defensas y dónde viven

- **Los encabezados** (`vercel.json`, fijados por `vercel-headers.test.ts`): una CSP estricta en producción (sólo scripts
  propios, sin `unsafe-inline` ni `unsafe-eval`, y `wasm-unsafe-eval` sólo para compilar el núcleo del duelo automático; `object-src 'none'`; `frame-ancestors 'none'`; el único WebSocket es la
  dirección exacta del relay), que en los otros dominios suma lo de la barra de Vercel (`vercel.live`); además
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cross-Origin-Opener-Policy`. HSTS lo
  pone Vercel.
- **El código:** sin `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni `postMessage` entre páginas; React escapa lo que dibuja y
  los enlaces externos llevan `rel="noreferrer"`. Lo guardado se lee con validación (`persistence.ts`) y un deck importado
  (ydke, ydk, JSON) tiene topes. Un duelo guardado vale sólo con un código de sala real y un tope de jugadas, y la copia de
  seguridad sólo escribe claves de la app, sin la mesa de un duelo (`backup.ts`).
- **El otro jugador es un dato no confiable:** todo mensaje pasa por `parseMessage` (`duel-protocol.ts`), que devuelve una copia
  con forma conocida o `null`; un id de carta sólo vale con las formas que de verdad viajan (un `constructor` o `__proto__`,
  usado como clave, devolvería algo heredado). Los nombres y el chat se limpian de controles y de las marcas que dan vuelta o
  esconden el texto (`stripHidden`); los ajustes del duelo sólo los fija el anfitrión; de las jugadas del rival se guardan como
  mucho 400 para deshacer (`MAX_MIRROR_ACTS`: quien las manda a ráfagas no congela a quien las recibe), y la identidad de una
  carta secreta nunca viaja: ids opacos y sólo se revela lo que el rival puede ver (`mat-public.ts`). En el duelo automático por
  enlace sólo el deck del invitado (`autoDeck`, con tope de frecuencia) hace bajar datos al anfitrión, y en pleno duelo no baja nada.
- **Un combo compartido también es de otro** (`combo-share.ts`): viaja en el hash (`#combo=`, deflate + base64url, nunca al
  servidor) o en un `*.ygolab-combo.json`, en un sobre versionado (`v: 1` y `v: 2` se leen siempre). Topes antes de decodificar y al
  inflar (256 KB: una bomba se corta), y se copian sólo los campos conocidos con tipos, rangos e ids con su patrón; el enlace se
  ofrece hasta 7.500 caracteres y, más largo, el archivo. No lleva usuario ni relay. El enlace va en `v: 2` (45 jugadas ≈ 730
  contra 1.700): sin los nombres (se piden por passcode al abrir; sin red, «Carta») y con cada id como índice de una tabla de
  passcodes (tope de 1.000, todo índice dentro de ella); se arma la forma `v: 1` y pasa por el mismo validador.
- **El replay de un duelo, igual** (`duel-replay-share.ts`): el mismo sobre (`kind: 'duel'`, `#replay=`, `*.ygolab-duel.json`), 2 MB
  inflado y 6.000 jugadas de tope, nombres por `cleanName`. Sin la clave del duelo, las respuestas del núcleo, el chat ni el relay;
  lo oculto del rival nunca estuvo y lo propio sólo va con «Incluir mi mano». Un enlace entra hasta ~950 jugadas; si no, el archivo.
- **El proxy de imágenes** (`api/card-image.ts`): sólo rutas con la forma de una imagen de carta o de set de YGOPRODeck, con el
  host fijo y sin seguir redirecciones; sólo los parámetros `path` y `w` (cada valor distinto sería otra copia en el CDN); sólo
  JPEG, PNG o WebP, con tope de bytes y de píxeles; lo que falla es un 502 que no se guarda. Sale con
  `Cross-Origin-Resource-Policy: same-origin`: otra página no lo usa como su CDN.
- **Las transmisiones en vivo** (`api/live.ts`): sólo las pestañas de transmisiones de los canales de `LIVE_CHANNELS`; nada del
  pedido llega a YouTube y cualquier parámetro se rechaza. El CDN guarda la respuesta unos segundos y sirve la anterior mientras
  trae la nueva, así YouTube recibe pocos pedidos aunque mire mucha gente; cada pedido tiene tope de tiempo y de tamaño. Si una
  página no trae la lista de videos, responde `ok: false`, nunca «no hay nada en vivo». La app valida lo que vuelve
  (`parseLiveResponse`) y arma el reproductor y los enlaces sólo con el id validado.
- **El relay** (`duel-relay/`): sólo los orígenes de `ALLOWED_ORIGINS`, códigos de sala al azar (8 símbolos, unos 40 bits), tope
  de tamaño y de ritmo, binarios prohibidos a los jugadores (los avisos del relay no se pueden falsificar) y espectadores que no
  mandan nada y tienen tope de entradas; no guarda ni registra mensajes, códigos ni direcciones. Los números, en
  `docs/duelo-relay.md`.
- **La cadena de suministro:** las acciones de GitHub, fijadas por commit, con `persist-credentials: false` y el token sólo en el
  paso del `git push` (`.github/workflows/`); `.npmrc` con `ignore-scripts=true` (ninguna dependencia corre código al
  instalarse) y Dependabot cada semana para npm y Actions.

## Lo que sólo hace quien administra las cuentas

1. **Verificación en dos pasos** (mejor con llaves de acceso) en GitHub, Vercel y Cloudflare: quien entra a una de esas cuentas
   puede publicar código.
2. **Cloudflare:** una regla de límite por IP sobre `/room/*` (Seguridad → WAF → Reglas de límite), para que nadie abra salas a
   montones.
3. **Vercel:** una regla del Firewall que limite por IP `/api/card-image` (y el modo «Attack Challenge» mientras dure un abuso),
   y Deployment Protection para que las vistas previas no sean públicas.
4. **GitHub:** el repositorio es público (AGPL-3.0) y de plan gratuito, sin reglas de protección de rama: activar en «Code security»
   el escaneo de secretos con protección de push y el aviso privado de vulnerabilidades (gratis en repos públicos) y, si se quiere,
   «Require status checks» en `main`.
5. Revisar cada tanto las integraciones y los tokens de las tres cuentas y revocar lo que no se use.

## Límites aceptados

- **El relay ve lo que pasa por él:** `wss://`, pero no cifrado de punta a punta; quien lo administre podría leer jugadas, vidas
  y chat (las cartas secretas no viajan en claro).
- **Quien tiene el código de sala entra** (no hay cuentas); con dos jugadores adentro, el resto queda afuera o mira.
- **El enlace de espectador es el mismo código:** quien lo use sin el modo espectador puede ocupar el lugar de un jugador que se
  cayó. Evitarlo pide un secreto por jugador, y eso rompe volver recargando; se aceptó para no perder un duelo por un corte.
- **El azar del duelo automático por enlace:** la baraja y el núcleo salen de una clave de 256 bits del anfitrión, pero el
  RNG del núcleo (xoshiro256**) no es criptográfico: monedas, dados y barajadas a la vista dan pocos bits usables por duelo (invertir el estado pide salidas enteras de 64 bits, que el invitado nunca ve; una barajada propia sí le muestra el orden que va descubriendo), la
  misma exposición que EDOPro. El anfitrión ve todo (corre el núcleo): el modo sigue siendo «entre amigos».
- **`style-src 'unsafe-inline'`:** React escribe estilos en línea y sin eso la interfaz se rompe; no permite ejecutar scripts.
- **Los scripts de efectos** se bajan de la rama principal de ProjectIgnis/CardScripts sin fijar un commit y sólo se leen como
  datos (nunca se ejecutan): un cambio de formato o malicioso mostraría efectos incorrectos hasta que se note.
- **Los datos de terceros** (meta, precios, banlists, replays) se dibujan como texto y las direcciones se arman con ids
  validados, pero un dato envenenado puede mostrar información incorrecta hasta que alguien lo note.

Un problema de seguridad se le avisa directo a quien administra el repositorio (`SECURITY.md`), sin abrir un issue público.
