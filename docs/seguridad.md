# Seguridad

Qué se protege, de qué, con qué, y qué queda en manos de quien administra las cuentas. Es un sitio sin cuentas de usuario ni base de datos: no guarda datos de nadie en un servidor propio (todo lo del usuario vive en su navegador) y no tiene secretos en el cliente. Lo que hay que cuidar es lo que se *carga* (código, datos de terceros), lo que se *recibe* (el otro jugador del duelo) y lo que se *publica* (el repositorio y sus despliegues).

## Superficie

| Pieza | Qué es | Qué puede salir mal |
|---|---|---|
| Sitio (Vercel) | HTML, JS y datos estáticos | código de terceros que se cuela en la página (XSS), datos externos que se renderizan |
| `api/card-image` | función de Vercel: proxy de imágenes de YGOPRODeck | que se use de proxy abierto, que se abuse del ancho de banda o de las peticiones a YGOPRODeck |
| Relay del duelo (`duel-relay/`, Cloudflare Worker) | reenvía mensajes entre dos jugadores y hasta dos espectadores | abuso desde otras páginas, salas ajenas, mensajes enormes o a ráfagas |
| Otro jugador | llega por el relay | mensajes mal formados o hechos a propósito para romper o engañar al cliente |
| Repositorio y CI | GitHub Actions, Dependabot, despliegue automático a `main` | dependencias o acciones comprometidas, tokens expuestos, datos envenenados que se publican solos |

## Qué se hace (y dónde)

**En el navegador**
- La política de seguridad de contenido (`vercel.json`) es estricta en producción: sólo scripts propios (sin `unsafe-inline` ni `unsafe-eval`), `object-src 'none'`, `frame-ancestors 'none'`, y el único WebSocket permitido es la dirección exacta del relay. Las previews de Vercel suman lo de su barra de comentarios (`vercel.live`). Un test (`vercel-headers.test.ts`) fija todo esto.
- No hay `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni `postMessage` entre páginas en el código; React escapa lo que renderiza. Los enlaces externos llevan `rel="noreferrer"`.
- Lo guardado en el navegador se lee con validación (`persistence.ts`) y las importaciones (ydke, ydk, copia de seguridad) tienen topes. Un duelo guardado vale sólo con un código de sala real y hasta 5000 jugadas (al volver se rejuegan todas); la copia de seguridad no incluye ni restaura la mesa guardada de un duelo en curso.
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cross-Origin-Opener-Policy` en todo el sitio; HSTS lo pone Vercel. El proxy de imágenes sale con `Cross-Origin-Resource-Policy: same-origin`: otras páginas no pueden enlazarlo como si fuera su CDN.

**El otro jugador es dato no confiable**
- Todo mensaje pasa por `parseMessage` (`duel-protocol.ts`), que devuelve una copia con forma conocida o `null`. Los ids de carta sólo valen con la forma que de verdad viaja: opacos (`c12`), de ficha (`token-3`) y, para lo revelado, `card-123-2`. Un id como `constructor` o `__proto__` se rechaza: usado después como clave de un objeto devolvería algo heredado y rompería al que lo recibe.
- Nombres y chat se limpian de controles y de las marcas que dan vuelta o esconden el texto (`stripHidden`).
- Los ajustes del duelo (vidas, mano de arranque) sólo los fija el anfitrión: el saludo de un invitado que los traiga no los cambia. De las jugadas del rival se guardan como mucho 400 para poder deshacerlas (después se parte de la mesa de ese momento): quien las manda a toda velocidad no congela la pestaña de quien las recibe.
- La identidad de las cartas secretas nunca viaja: por la red van ids opacos y sólo se revela lo que el rival puede ver (`mat-public.ts`).

**Proxy de imágenes (`api/card-image`)**
- Sólo pide a YGOPRODeck rutas con la forma de una imagen de carta (`cards/14558127.jpg`, `cards/14558127_1.jpg`) o de un set (`sets/JUSH.jpg`); el host de destino es fijo y no se siguen redirecciones.
- Sólo acepta los parámetros `path` y `w` (cualquier otro se rechaza antes de pedir nada, porque cada valor distinto sería una copia nueva en el CDN), y lo rechazado se recuerda unos minutos en el CDN.
- Sólo devuelve `image/jpeg`, `image/png` o `image/webp` de hasta 2 MB, y sharp no achica nada de más de 4 megapíxeles. Lo que no cumple es un 502 que no se guarda en ninguna caché.

**Relay**
- Sólo orígenes permitidos (`ALLOWED_ORIGINS`), códigos de sala de 8 símbolos al azar (unos 40 bits), tope de 16 KB por mensaje, límite de ritmo por conexión, binarios prohibidos para los jugadores (los avisos del relay no se pueden falsificar), espectadores que no pueden mandar nada. Quien entra a mirar hace que los jugadores repitan su estado, pero con tope (una ráfaga corta y después uno cada dos segundos), así que entrar y salir sin parar no los hace inundar el relay. No guarda ni registra mensajes, códigos ni direcciones.

**Cadena de suministro**
- Acciones de GitHub fijadas por commit; permisos de sólo lectura por defecto; `persist-credentials: false` en todos los checkouts.
- Los workflows que escriben en `main` (datos diarios) no dejan el token guardado en el repo: lo usan sólo en el paso del `git push`.
- `.npmrc` con `ignore-scripts=true`: ninguna dependencia ejecuta código al instalarse (hoy ninguna lo necesita).
- Dependabot (npm y Actions, cada semana), `npm audit` sin vulnerabilidades y GitGuardian en cada PR.

## Lo que sólo puede hacer quien administra las cuentas

Nada de esto se puede dejar hecho desde el código:

1. **Verificación en dos pasos** (de preferencia con llaves de acceso) en GitHub, Vercel y Cloudflare. Es lo que más baja el riesgo real: quien entra a una de esas cuentas puede publicar código.
2. **Cloudflare, para el relay:** una regla de límite de peticiones por IP sobre las conexiones a `/room/*` (Seguridad → WAF → Reglas de límite) frena que alguien abra salas a montones. Los cambios en `duel-relay/` (por ejemplo `ALLOWED_ORIGINS` en `wrangler.jsonc`) sólo rigen cuando se vuelve a publicar el Worker (`npx wrangler@4 deploy`).
3. **Vercel, para `/api/card-image`:** una regla del Firewall que limite las peticiones por IP a esa ruta (y, si se quiere, el modo "Attack Challenge" mientras haya un abuso).
4. **Vercel → Deployment Protection** para las previews (que no sean públicas).
5. **GitHub:** el repositorio es privado y de plan gratuito, así que no admite reglas de protección de rama; si algún día se pasa a Pro o se hace público, activar "Require status checks" (CI) en `main`, y el escaneo de secretos con protección de push.
6. Revisar de vez en cuando las integraciones y los tokens de las tres cuentas y revocar lo que no se use.

## Límites conocidos

- **El relay ve lo que pasa por él:** el duelo viaja por WebSocket seguro (`wss://`) pero no cifrado de punta a punta; quien administre el relay podría leerlo. No contiene nada sensible (jugadas, vidas, chat), y las cartas secretas no viajan en claro.
- **Quien tenga el código de sala entra** (es un enlace, sin cuentas); si ya hay dos jugadores, el resto queda afuera o entra a mirar si usa el enlace de espectador.
- **El enlace de espectador es el mismo código de sala:** quien lo tenga y se conecte sin el modo espectador puede ocupar el lugar de un jugador que se cayó, antes de que vuelva. Evitarlo pide un secreto aparte por jugador, y eso rompe volver a la partida recargando; se aceptó a cambio de no perder el duelo por un corte. Compartir el enlace de espectador sólo con quien se confía.
- **`style-src 'unsafe-inline'`:** React escribe estilos en línea en los elementos (`style=""`); sin ese permiso la interfaz se rompe. No permite ejecutar scripts.
- Los scripts de efectos de cartas se bajan de la rama principal del repositorio de la comunidad (ProjectIgnis/CardScripts) sin fijar un commit, y sólo se leen como datos (nunca se ejecutan): un cambio de formato o malicioso podría mostrar efectos incorrectos hasta que se note.
- Los datos diarios (meta, precios, banlists, replays) vienen de sitios de terceros y se publican solos: se renderizan como texto y las direcciones se arman con identificadores validados, pero un cambio de formato o un dato envenenado puede mostrar información incorrecta hasta que alguien lo note.

## Cómo avisar de un problema

El repositorio es privado: avisar directamente a quien lo administra, sin abrir un issue público con el detalle.
