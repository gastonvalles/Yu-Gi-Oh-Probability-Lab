# Relay del duelo por enlace

El duelo por enlace junta a dos jugadores, cada uno en su dispositivo, por un **relay**: un servidor chico que reenvía los mensajes de uno al otro. Vive en `duel-relay/` y corre en Cloudflare (un Worker más un Durable Object por sala).

## Qué hace y qué no

- Una sala por código de 8 letras, de **dos** jugadores y hasta **dos espectadores**. El tercer jugador, o el tercer espectador, recibe "sala llena" (un jugador no ocupa el lugar de un espectador ni al revés).
- Reenvía cada mensaje de texto sin leerlo ni guardarlo. **No hay base de datos**: la sala existe mientras haya conexiones.
- Avisa a cada jugador cuando el otro entra o sale, y cuántos espectadores hay, con mensajes binarios (los jugadores no pueden mandar binarios, así nadie puede hacerse pasar por el relay).
- **Espectadores** (`?role=spectator` en la conexión): reciben el texto de los dos jugadores, cada mensaje precedido de quién lo mandó (un `0` o un `1` que asigna el relay por orden de llegada; un jugador que reconecta con su identidad conserva el suyo) y un aviso binario de cuántos jugadores hay. **No pueden hacer nada**: lo que manden no llega a ningún jugador y los desconecta (código 1008), salvo la palabra `resync`, que pide a los jugadores que repitan su estado (los jugadores lo reciben como un aviso binario de espectadores con `sync`; el relay lo deja pasar como mucho cada dos segundos por espectador). Al entrar uno, los jugadores reciben ese mismo aviso para que lo pongan al día.
- **Topes para los espectadores** (un enlace de espectador usado en bucle no tiene que hacer trabajar a los jugadores ni al relay): entre todos los de una sala, seis entradas seguidas y después una cada dos segundos (lo que pase se rechaza con un 429, sin abrir la conexión, y el cliente espera más cada vez); los jugadores reciben el pedido de que repitan su estado en una ráfaga de tres y después uno cada dos segundos, entren o pidan quienes pidan; y un espectador que pide el estado de más diez veces seguidas se desconecta (1008).
- Límites: 16 KB por mensaje, 30 mensajes por segundo (ráfaga de 60), y solo acepta conexiones de las páginas listadas en `ALLOWED_ORIGINS`. Lo que se pasa se cierra con un código (1003 binario, 1009 enorme, 1008 ritmo).
- Contesta el latido (`ping` → `pong`) sin despertar la sala, que hiberna entre mensajes.
- Cuenta, sin datos de nadie, `room_opened` (entra el primer jugador), `room_paired` (llega el segundo) y `room_watched` (entra un espectador). No registra el código de la sala ni direcciones: el registro de cada petición (que traería el código en la dirección y la IP de quien se conecta) está apagado en `wrangler.jsonc` (`observability.logs.invocation_logs: false`).

El código de la app que lo usa está en `src/app/duel-socket.ts` (cliente con reconexión) y `src/app/duel-relay-rules.ts` (lo que comparten los dos lados).

## Probarlo en tu máquina (sin cuenta)

```bash
cd duel-relay
npx wrangler@4 dev --local --port 8788 --var "ALLOWED_ORIGINS:http://localhost:5173"
```

En **Windows**, si falla con `SQLITE_CANTOPEN`, es el límite de 260 caracteres de la ruta: apuntá el estado a una ruta corta con `--persist-to C:/tmp/relay`.

Con el relay levantado, la prueba de integración (no corre en el CI) juega un duelo completo con una caída de la conexión y prueba a los espectadores (el límite de dos, que no puedan mandar, las etiquetas, el pedido de estado y los topes de entradas y de pedidos):

```bash
VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788 npm test -- duel-relay.e2e
```

## Publicarlo (lo hacés vos, con tu cuenta de Cloudflare)

1. `cd duel-relay && npx wrangler@4 login` (abre el navegador; la cuenta gratuita alcanza).
2. Si tu sitio no es `yu-gi-oh-probability-lab.vercel.app`, ajustá `ALLOWED_ORIGINS` en `duel-relay/wrangler.jsonc` (separados por coma; `*` vale por letras, números y guiones, para los despliegues de prueba de Vercel). Los de prueba se aceptan sólo con el nombre del proyecto y el del equipo (`yu-gi-oh-probability-lab-*-gastonvalles-projects.vercel.app`): el nombre de otra cuenta que empiece igual no pasa. Esto frena el abuso desde otras páginas; no es seguridad (cualquier cliente que no sea un navegador puede mandar el encabezado que quiera).
3. `npx wrangler@4 deploy`. Devuelve una dirección como `https://ygo-lab-duel-relay.<tu-subdominio>.workers.dev`.
4. En Vercel, agregá la variable de entorno **`VITE_DUEL_RELAY_URL`** con esa dirección en `wss://` (`wss://ygo-lab-duel-relay.<tu-subdominio>.workers.dev`) y volvé a desplegar.
5. La política de seguridad de `vercel.json` permite sólo la dirección exacta del relay (`wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`, en sus dos reglas): si publicás el Worker con otro nombre o subdominio, cambiala ahí (y `ALLOWED_ORIGINS` en `duel-relay/wrangler.jsonc` si cambia el sitio), o el navegador bloqueará la conexión.

Al publicar una versión con espectadores, publicá **primero el relay**: un enlace de espectador abierto contra un relay anterior lo trataría como a un jugador (la app lo detecta y no lo usa, pero ocupa un lugar un instante).

Revisá en el panel de Cloudflare los límites vigentes del plan gratuito para Durable Objects y Workers antes de abrirlo al público.

## Ver cuánto se usa

En el panel de Cloudflare, Workers → `ygo-lab-duel-relay` → Logs: buscá los eventos `room_opened` y `room_paired`. Su cociente dice cuántas salas llegan a juntarse de a dos, que es la medida de si el duelo por enlace se usa de verdad.

## Cosas a saber

- Un mensaje de un jugador nunca se interpreta: el relay no sabe nada de cartas ni de reglas.
- Si un jugador se cae, el otro lo ve ausente; al volver, los dos se dan la mano de nuevo y el estado se repone solo (`hello` + `sync`).
- El relay cierra al jugador que reemplaza una conexión colgada con su mismo identificador, pero ese cierre puede no llegarle al cliente viejo (está colgado): la app no depende de recibirlo.
- Toda la información de la mesa viaja por el relay. No es anti-trampas: está pensado para jugar con amigos.
