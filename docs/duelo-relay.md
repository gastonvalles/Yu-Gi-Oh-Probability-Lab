# Relay del duelo por enlace

El duelo por enlace junta a dos jugadores, cada uno en su dispositivo, por un **relay**: un Worker de Cloudflare (`duel-relay/`)
con un Durable Object por sala (`DuelRoom`) y otro (`RoomIndex`) para la lista de salas públicas. En la app lo usan
`src/app/duel-socket.ts` (el cliente, con reconexión) y `src/app/duel-rooms.ts` (la lista); lo que comparten los dos lados
(límites, códigos de cierre, `RoomRegistry`) está en `src/app/duel-relay-rules.ts`. Lo que viaja entre los jugadores, en
`docs/duelo.md`.

El sitio lo encuentra por `VITE_DUEL_RELAY_URL` (`wss://…`), cargada en Vercel en todos los entornos.

## Qué hace y qué no

El detalle, en los comentarios de cabecera de `duel-relay/src/index.ts` y `duel-relay-rules.ts`; acá, lo que decide y los números:

- **Límites:** 16 KB por mensaje, 30 por segundo (ráfaga de 60) y sólo los orígenes de `ALLOWED_ORIGINS`; espectadores, entre
  todos los de una sala, seis entradas seguidas y después una cada 2 s (si no, un 429). Códigos de cierre: 1003 (binario de un
  jugador), 1008 (ritmo, o un espectador que manda algo), 1009 (mensaje enorme), 4000 (reemplazada por una conexión nueva), 4001
  (sala llena), 4002 (`CLOSE_GONE`) y 4400 (`CLOSE_ROOM_OVER`).
- Una sala por código, de dos jugadores y hasta dos espectadores, que existe mientras haya conexiones: **no hay base de datos**.
  Reenvía el texto sin leerlo ni guardarlo y no es anti-trampas (toda la mesa pasa por él: es para jugar con amigos).
- Sus avisos son binarios y un jugador no puede mandar binarios: nadie se hace pasar por el relay. Un espectador no manda nada
  salvo `resync`, con topes por sala: un enlace de espectador usado en bucle no hace trabajar a nadie.
- **Al reconectar**, el relay cierra la conexión colgada de ese jugador, pero el cierre puede no llegarle al cliente viejo: la app
  no depende de recibirlo.
- **Cerrar la sala** (`CLOSE_ROOM_OVER`, lo manda un jugador cuando el duelo terminó y el rival se fue): corta a todos y a quien
  llegue después, para que el que se queda no pueda dejar la sala abierta a que un tercero vea su mesa.
- No registra códigos ni direcciones (sin el registro de cada petición en `wrangler.jsonc`); sólo cuenta `room_opened`,
  `room_paired` y `room_watched`, que se leen en Cloudflare, Workers → `ygo-lab-duel-relay` → Logs.

## Salas públicas y duelos en vivo

- `GET /rooms` trae `{ rooms, live }`; los POST (`/rooms`, `/rooms/close`, `/rooms/live`, con `?room=CÓDIGO`) llevan el JSON como
  texto plano para no disparar la consulta previa de CORS.
- El anfitrión anota su sala con un token que sólo él conoce y la baja al llegar el rival o al irse; la que nadie baja vence sola.
  Con el rival adentro pasa a los duelos en vivo mientras el anfitrión avise.
- **Qué se publica:** el nombre del anfitrión, el formato, Single o Match, el reloj y el siding; de un duelo en vivo, además,
  cuántos miran, desde cuándo y el nombre del rival (es lo único de quien entró que se publica). Nada de la mesa, y **una sala
  privada nunca se anota.** Los nombres se muestran como texto.

## Primero el relay, después el sitio

Los dos lados se publican por separado y ninguno rompe al otro, pero se publica **primero el relay**, y hay que volver a
publicarlo cuando cambia `duel-relay/` **o `src/app/duel-relay-rules.ts`** (el Worker lo empaqueta). Un relay de antes rechaza lo
que no conoce (un reloj o un campo nuevo de una sala pública), así que lo nuevo se acepta en el relay antes de que el sitio lo
mande, y lo viejo se sigue aceptando (`PUBLIC_ROOM_LIMITS_MIN`).

## Probarlo en tu máquina (sin cuenta)

```bash
cd duel-relay
npx wrangler@4 dev --local --port 8788 --persist-to C:/tmp/relay --var "ALLOWED_ORIGINS:http://localhost:5173,http://127.0.0.1:5173"
```

El sitio, con `VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788` en `.env.local`. La prueba de punta a punta (una caída de la conexión y
los espectadores) usa su propia variable: sin ella se saltea, así que no corre en el CI.

```bash
DUEL_RELAY_E2E_URL=ws://127.0.0.1:8788 npm test -- duel-relay.e2e
```

- **El publicado** también acepta `localhost:5173` y `127.0.0.1:5173` (el servidor de desarrollo tiene que estar en ese puerto),
  pero una sala pública armada probando aparece en la arena de producción: probá en privada o cerrala.
- **Windows:** `SQLITE_CANTOPEN` es el largo de la ruta (por eso el `--persist-to` corto). Levantar `wrangler dev` varias veces
  deja procesos `workerd` colgados y el relay deja de contestar (la página queda en «Conectando…»): matalos y levantá uno solo,
  con otra carpeta en `--persist-to`.

## Publicarlo (con la cuenta de Cloudflare)

1. `cd duel-relay && npx wrangler@4 login` (la cuenta gratuita alcanza).
2. Si el sitio cambia de dirección, `ALLOWED_ORIGINS` en `duel-relay/wrangler.jsonc` (separados por coma; `*` vale por letras,
   números y guiones). Frena el abuso desde otras páginas, no es seguridad: un cliente que no es un navegador manda el encabezado
   que quiere.
3. `npx wrangler@4 deploy`.
4. Si cambió la dirección del Worker: `VITE_DUEL_RELAY_URL` en Vercel (se lee al compilar: hay que volver a desplegar) y la CSP de
   `vercel.json` (sus dos reglas; lo vigila `vercel-headers.test.ts`), o el navegador bloquea la conexión.
