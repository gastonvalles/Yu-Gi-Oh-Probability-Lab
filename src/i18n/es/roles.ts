/**
 * Categorización de roles: la pantalla de clasificación, el editor de una carta, la guía y las descripciones de cada origen y rol.
 * Los nombres (Starter, Extender, Handtrap, Boardbreaker, Brick, Garnet, Engine, Non-engine, Disruption…) quedan igual en los dos idiomas:
 * se traducen sus descripciones, guías y textos vacíos.
 */
export const roles = {
  // Descripción corta de cada origen y rol (deck-groups.ts).
  'roles.group.engine.description': 'Pertenece al motor o plan principal del deck.',
  'roles.group.nonEngine.description': 'Aporta interacción, cobertura o soporte por fuera del motor principal.',
  'roles.group.starter.description': 'Carta que por sí sola te pone a jugar o encuentra el punto de arranque.',
  'roles.group.extender.description': 'Suma cuerpo, recursos o continuidad una vez que la mano ya empezó.',
  'roles.group.enabler.description': 'Habilita la línea: pieza o condición que otras cartas necesitan para funcionar.',
  'roles.group.searcher.description': 'Busca una pieza concreta del deck, GY o zonas públicas (por ejemplo, al invocarse o tributarse).',
  'roles.group.draw.description': 'Te hace robar cartas (Mulcharmy, Pot of Desires…); no busca una carta concreta.',
  'roles.group.payoff.description': 'Convierte la línea en ventaja real, presión o cierre de turno.',
  'roles.group.recovery.description': 'Recupera recursos, recicla piezas o recompone después de interrupción.',
  'roles.group.handtrap.description': 'Interacción que frena al rival desde la mano.',
  'roles.group.disruption.description': 'Frena al rival en mesa o en su turno (negaciones, trampas), por sí sola.',
  'roles.group.boardbreaker.description': 'Rompe campo o quita cartas del rival por sí sola. Si solo lo hace cuando se cumple una condición de tu línea, marcá su función principal.',
  'roles.group.floodgate.description': 'Limita líneas del rival por presencia o efecto continuo.',
  'roles.group.brick.description': 'Carta que preferís no robar al inicio si no viene acompañada.',
  'roles.group.garnet.description': 'Pieza que idealmente queda en deck porque en mano invalida o empeora una línea.',
  'roles.group.qualifiedOrigin': 'Origen: {label}',
  'roles.group.qualifiedRole': 'Rol: {label}',

  // Secciones de roles, ayuda de cada origen y rol, y su resumen de una línea (classification-copy.ts).
  'roles.section.plan.title': 'Plan de Juego',
  'roles.section.plan.description': 'Inicio, conversión y continuidad de tu línea.',
  'roles.section.interaction.title': 'Interacción',
  'roles.section.interaction.description': 'Cómo frena o rompe al rival, por sí sola (no por una condición de tu línea).',
  'roles.section.utility.title': 'Utilidad',
  'roles.section.utility.description': 'Cartas incómodas o que preferís no robar.',
  'roles.help.engine': 'Parte del core del deck: cartas que querés ver para ejecutar el plan principal.',
  'roles.help.nonEngine': 'Interacción o soporte que no pertenece al motor principal del deck.',
  'roles.blurb.engine': 'Core y plan principal.',
  'roles.blurb.nonEngine': 'Interacción y soporte externo.',
  'roles.help.starter': 'Carta que por sí sola inicia la línea principal.',
  'roles.help.extender': 'Continúa la jugada una vez que la mano ya empezó.',
  'roles.help.enabler': 'Habilita la línea: pieza o condición que otras cartas necesitan para funcionar.',
  'roles.help.searcher': 'Busca una pieza concreta del deck, GY o zonas visibles (por ejemplo, al invocarse o tributarse).',
  'roles.help.draw': 'Te hace robar cartas (Mulcharmy, Pot of Desires…); no busca una carta concreta.',
  'roles.help.payoff': 'Convierte la línea en ventaja, presión o cierre.',
  'roles.help.recovery': 'Recupera recursos después de gastar piezas o recibir interacción.',
  'roles.help.handtrap': 'Interacción que frena al rival desde la mano.',
  'roles.help.disruption': 'Frena al rival en mesa o en su turno (negaciones, trampas), por sí sola.',
  'roles.help.boardbreaker': 'Rompe campo o quita cartas del rival por sí sola. Si solo lo hace cuando se cumple una condición de tu línea, marcá su función principal.',
  'roles.help.floodgate': 'Restringe líneas del rival de forma continua o persistente.',
  'roles.help.brick': 'Carta incómoda de robar si no viene acompañada.',
  'roles.help.garnet': 'Pieza que preferís dejar en el deck porque en mano empeora la línea.',

  // Distribución de roles en la mano (role-distribution.ts).
  'roles.distribution.starter': 'Starters',
  'roles.distribution.extender': 'Extenders',
  'roles.distribution.interaction': 'Interacción',
  'roles.distribution.brick': 'Bricks',

  // Tipo de carta (singular y plural) y estado de una carta en la lista (classification-model.ts).
  'roles.cardType.monster': { one: 'Monstruo', other: 'Monstruos' },
  'roles.cardType.spell': { one: 'Magia', other: 'Magias' },
  'roles.cardType.trap': { one: 'Trampa', other: 'Trampas' },
  'roles.status.noOrigin': 'Sin origen',
  'roles.status.noFunction': 'Sin función',
  'roles.status.review': 'Revisión',

  // Editor de una carta (modal de clasificar).
  'roles.editor.line': '{summary} · ×{copies} en el Main',
  'roles.editor.confirm': 'Confirmar sugerencia',
  'roles.editor.suggested': 'Sugerida automáticamente: confirmala si te parece bien.',
  'roles.fields.originAria': 'Origen',
  'roles.fields.originQuestion': '¿Dónde encaja en tu plan?',
  'roles.fields.rolesAria': 'Roles',
  'roles.fields.roleQuestion': '¿Qué función cumple cuando la robás?',
  'roles.fields.help': '¿Qué significa cada rol?',
  'roles.overlay.aria': 'Clasificar {name}',
  'roles.overlay.panel': 'Clasificación de la carta',
  'roles.overlay.body': 'Origen y roles',
  'roles.overlay.previous': 'Anterior',
  'roles.overlay.next': 'Siguiente',

  // Lista de cartas por clasificar.
  // En español el conteo de copias dice "copias" también con una sola: así estaba antes de pasar a mensajes.
  'roles.queue.groupCount': { one: '{cards} · {count} copia', other: '{cards} · {count} copias' },
  'roles.queue.unclassified': 'Sin clasificar',
  'roles.queue.noRoles': 'sin roles',
  'roles.queue.noOrigin': 'sin origen',

  // Pantalla de clasificación.
  'roles.panel.title': 'Clasificá tus cartas',
  'roles.panel.subtitle': 'Contale al Lab qué hace cada carta en tu plan.',
  'roles.panel.activeView': 'Vista activa',
  'roles.panel.ringLabel': 'Cartas clasificadas',
  'roles.panel.ringPartial': 'listas',
  'roles.panel.ringDone': 'listo',
  'roles.panel.remaining': { one: 'Te falta {count} carta por clasificar', other: 'Te faltan {count} cartas por clasificar' },
  'roles.panel.confirmSuggestions': { one: 'Confirmá {count} sugerencia para cerrar la clasificación', other: 'Confirmá {count} sugerencias para cerrar la clasificación' },
  'roles.panel.allDone': 'Tu deck está clasificado y listo para medir',
  'roles.panel.classifyAll': 'Clasificar todo',
  'roles.panel.reviewSuggestions': 'Revisar una por una',
  'roles.panel.confirmAll': { one: 'Confirmar la sugerencia', other: 'Confirmar las {count} sugerencias' },
  'roles.panel.goToLab': 'Ir al Lab',
  'roles.panel.reclassifyAll': 'Reclasificar todo',
  'roles.panel.noCardsTitle': 'Todavía no hay cartas para clasificar',
  'roles.panel.noCardsText': 'Primero armá o importá tu Main Deck. Después vas a poder clasificar cada carta.',
  // En español el aviso dice "cartas" también con una sola: así estaba antes de pasar a mensajes.
  'roles.panel.resuggested': {
    one: '{count} carta con la sugerencia de hoy. Revisala.',
    other: '{count} cartas con la sugerencia de hoy. Revisalas una por una.',
  },
  'roles.panel.confirmTitle': '¿Reclasificar todo el deck?',
  'roles.panel.confirmText': {
    one: 'La carta vuelve a la sugerencia automática y se pierde lo que confirmaste o corregiste a mano.',
    other: 'Las {count} cartas vuelven a la sugerencia automática y se pierde lo que confirmaste o corregiste a mano.',
  },
  'roles.panel.confirmAction': 'Reclasificar',

  // Vistas (filtros) de la lista: nombre y descripción.
  'roles.panel.filter.unclassified': 'Sin completar',
  'roles.panel.filter.missingRole': 'Sin rol',
  'roles.panel.filter.review': 'Revisión pendiente',
  'roles.panel.filter.complete': 'Completas',
  'roles.panel.filter.all': 'Todo el Main',
  'roles.panel.overview.all': 'Vista general del Main Deck.',
  'roles.panel.overview.unclassified': 'Cartas que todavía requieren una decisión.',
  'roles.panel.overview.missingOrigin': 'Todavía no tienen origen definido.',
  'roles.panel.overview.missingRole': 'Todavía no tienen roles asignados.',
  'roles.panel.overview.review': 'Tienen clasificación, pero conviene validarlas.',
  'roles.panel.overview.complete': 'Listas para medir en el Probability Lab.',

  // Qué se dice cuando una vista no tiene cartas.
  'roles.panel.empty.unclassified.title': 'No quedan cartas pendientes en esta cola.',
  'roles.panel.empty.unclassified.text': 'Podés repasar otros grupos desde la derecha o pasar al Probability Lab cuando termines de validar la build.',
  'roles.panel.empty.missingOrigin.title': 'No hay cartas sin origen en esta vista.',
  'roles.panel.empty.missingOrigin.text': 'El motor y los slots externos ya quedaron diferenciados.',
  'roles.panel.empty.missingRole.title': 'No hay cartas sin roles en esta vista.',
  'roles.panel.empty.missingRole.text': 'La función táctica de estas cartas ya quedó definida.',
  'roles.panel.empty.review.title': 'No hay cartas pendientes de revisión.',
  'roles.panel.empty.review.text': 'Las cartas cargadas en esta vista ya están validadas.',
  'roles.panel.empty.complete.title': 'Todavía no hay cartas completas en esta vista.',
  'roles.panel.empty.complete.text': 'Primero definí origen y roles para poblar este subconjunto.',
  'roles.panel.empty.all.title': 'Todavía no hay cartas para clasificar.',
  'roles.panel.empty.all.text': 'Primero armá o importá tu Main Deck. Después vas a poder marcar origen y roles.',
  'roles.panel.empty.group.title': 'Este grupo está vacío por ahora.',
  'roles.panel.empty.group.text': 'Ajustá el filtro o seguí clasificando cartas para poblarlo.',

  // Guía de clasificación.
  'roles.guide.title': 'Guía de clasificación',
  'roles.guide.kicker': 'Modelo',
  'roles.guide.subtitle': 'Origen y roles usados en el lab. Consultala solo cuando necesites recordar la definición.',
  'roles.guide.originTitle': 'Origen',
  'roles.guide.originText': 'Responde si la carta pertenece al motor principal o a un espacio externo/flexible.',
  'roles.guide.rolesTitle': 'Roles',
  'roles.guide.rolesText': 'Responden qué hace la carta dentro de tu mano, tu línea o tu plan de turno.',
} as const
