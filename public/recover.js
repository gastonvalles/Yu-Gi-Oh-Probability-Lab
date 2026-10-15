/*
 * Red de seguridad del arranque. Si un archivo de /assets falla al cargar, lo vuelve a bajar salteando el caché del navegador y recarga la página (una vez por minuto).
 *
 * Por qué hace falta: vercel.json marca todo /assets como inmutable por un año, y esa cabecera sale también en un 404. Justo después de un deploy, el HTML nuevo puede
 * llegar antes que alguno de sus archivos; si el navegador pide uno en ese rato, recibe un 404 y lo guarda como inmutable: la app queda en blanco aunque el archivo
 * ya exista, hasta que se limpie el caché a mano. Una recarga común no lo cura (reusa el 404 guardado); `fetch(url, { cache: 'reload' })` sí lo pisa.
 *
 * Es un script aparte, sin hash, y se carga antes que el módulo de la app (no puede ir adentro de la app: es justamente la app lo que no llega a arrancar).
 * Sólo mira scripts y hojas de estilo; una imagen que no carga no recarga nada. Si no hay sessionStorage no hace nada (no podría evitar un bucle).
 * Ojo si lo tocás: la prueba src/__tests__/asset-recovery.test.ts lo ejecuta tal cual está.
 */
/* global window */
;(function (w) {
  var KEY = 'ygo-lab:asset-heal'
  var WAIT_MS = 60000
  var failed = {}
  var timer = 0

  function heal() {
    var urls = Object.keys(failed)

    failed = {}
    timer = 0
    Promise.all(
      urls.map(function (url) {
        return w.fetch(url, { cache: 'reload' }).catch(function () {})
      }),
    ).then(function () {
      w.location.reload()
    })
  }

  w.addEventListener(
    'error',
    function (event) {
      var target = event.target
      var url = target && target !== w && (target.tagName === 'SCRIPT' ? target.src : target.tagName === 'LINK' ? target.href : '')

      if (!url || url.indexOf('/assets/') < 0) {
        return
      }

      var last

      try {
        last = Number(w.sessionStorage.getItem(KEY)) || 0
      } catch {
        return
      }

      if (Date.now() - last < WAIT_MS) {
        return
      }

      failed[url] = true

      // Un rato para juntar todos los que fallaron (son varios a la vez) antes de bajarlos de nuevo.
      if (!timer) {
        timer = w.setTimeout(function () {
          try {
            w.sessionStorage.setItem(KEY, String(Date.now()))
          } catch {
            return
          }

          heal()
        }, 300)
      }
    },
    true,
  )
})(window)
