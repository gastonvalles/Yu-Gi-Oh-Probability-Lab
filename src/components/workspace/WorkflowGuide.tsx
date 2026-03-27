import { formatInteger } from '../../app/utils'

interface WorkflowGuideProps {
  mainDeckCount: number
  classifiedCards: number
  totalClassifiableCards: number
  patternCount: number
}

export function WorkflowGuide({
  mainDeckCount,
  classifiedCards,
  totalClassifiableCards,
  patternCount,
}: WorkflowGuideProps) {
  const missingMainDeckCards = Math.max(0, 40 - mainDeckCount)
  const missingRoleCount = Math.max(0, totalClassifiableCards - classifiedCards)
  const activeStep =
    mainDeckCount < 40
      ? 1
      : totalClassifiableCards === 0 || classifiedCards < totalClassifiableCards
        ? 2
        : patternCount === 0
          ? 3
          : 4
  const currentMessage =
    activeStep === 1
      ? mainDeckCount === 0
        ? 'Buscá cartas en el buscador. Click agrega al Main Deck, arrastrar mueve entre Main, Extra y Side, y click derecho quita.'
        : `Seguí sumando cartas hasta llegar a 40 en el Main Deck. Te faltan ${formatInteger(missingMainDeckCards)}.`
        : activeStep === 2
          ? `En el paso 2 definí origen y función de cada carta. Te faltan ${formatInteger(missingRoleCount)} carta${missingRoleCount === 1 ? '' : 's'} sin cerrar.`
          : activeStep === 3
            ? 'En el paso 3 definí al menos un chequeo de apertura o problema para empezar a medir consistencia.'
          : 'Ya podés leer resultados exactos y probar manos reales.'

  const overallStatus =
    mainDeckCount >= 40 && totalClassifiableCards > 0 && classifiedCards === totalClassifiableCards && patternCount > 0
      ? 'Listo'
      : totalClassifiableCards > 0 && classifiedCards > 0
        ? 'En progreso'
        : 'Empezando'
  const currentStepLabel =
    activeStep === 1
      ? 'Paso actual: armá tu deck'
      : activeStep === 2
        ? 'Paso actual: categorizá cartas'
        : activeStep === 3
          ? 'Paso actual: definí chequeos'
          : 'Paso actual: leé estadísticas'

  const steps = [
    {
      title: 'Deck',
      metric: `${formatInteger(mainDeckCount)} / 40`,
      detail:
        mainDeckCount >= 40
          ? 'Main Deck listo.'
          : mainDeckCount > 0
            ? `${formatInteger(missingMainDeckCards)} carta${missingMainDeckCards === 1 ? '' : 's'} más para la base.`
            : 'Empezá agregando cartas.',
      state: mainDeckCount >= 40 ? 'done' : activeStep === 1 ? 'current' : 'pending',
    },
    {
      title: 'Categorization',
      metric:
        totalClassifiableCards === 0
          ? '0 / 0'
          : `${formatInteger(classifiedCards)} / ${formatInteger(totalClassifiableCards)}`,
      detail:
        totalClassifiableCards === 0
          ? 'Esperando Main Deck.'
          : classifiedCards === totalClassifiableCards
            ? 'Todo marcado.'
            : `${formatInteger(missingRoleCount)} sin cerrar.`,
      state:
        totalClassifiableCards > 0 && classifiedCards === totalClassifiableCards
          ? 'done'
          : activeStep === 2
            ? 'current'
            : 'pending',
    },
    {
      title: 'Chequeos',
      metric:
        patternCount > 0
          ? `${formatInteger(patternCount)} cargada${patternCount === 1 ? '' : 's'}`
          : '0 cargadas',
      detail:
        patternCount > 0
          ? 'Ya hay chequeos activos.'
          : 'Definí aperturas o problemas.',
      state: patternCount > 0 ? 'done' : activeStep === 3 ? 'current' : 'pending',
    },
    {
      title: 'Stats',
      metric: mainDeckCount > 0 && patternCount > 0 ? 'Disponibles' : 'Esperando',
      detail:
        mainDeckCount > 0 && patternCount > 0
          ? 'Podés medir y practicar.'
          : 'Aparecen cuando completes lo anterior.',
      state: activeStep === 4 ? 'current' : 'pending',
    },
  ] as const

  return (
    <article className="surface-panel p-2.5">
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-3 max-[900px]:flex-col max-[900px]:items-stretch">
          <div className="min-w-0">
            <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Ruta rápida</p>
            <h2 className="m-0 text-[0.98rem] leading-none">Qué te falta para terminar</h2>
          </div>

          <span className="app-chip-accent self-start px-2 py-1 text-[0.74rem] whitespace-nowrap">
            Estado: {overallStatus}
          </span>
        </div>

        <div className="surface-card flex items-start justify-between gap-3 px-2.5 py-2 max-[900px]:grid max-[900px]:gap-1.5">
          <div className="min-w-0">
            <strong className="block text-[0.76rem] uppercase tracking-widest text-(--accent-strong)">
              {currentStepLabel}
            </strong>
            <p className="m-[0.18rem_0_0] text-[0.78rem] leading-[1.18] text-(--text-main)">
              {currentMessage}
            </p>
          </div>

          <span className="app-chip px-2 py-0.5 text-[0.72rem] whitespace-nowrap max-[900px]:justify-self-start">
            Paso {activeStep} / 4
          </span>
        </div>

        <div className="grid gap-1.5 min-[700px]:grid-cols-2 min-[1120px]:grid-cols-4">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className={[
                'grid gap-1 px-2 py-1.5',
                step.state === 'current'
                  ? 'surface-panel-strong'
                  : step.state === 'done'
                    ? 'surface-card-accent'
                    : 'surface-card',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'grid h-5 w-5 place-items-center text-[0.72rem]',
                    step.state === 'pending' ? 'app-chip' : 'app-chip-accent',
                  ].join(' ')}
                >
                  {index + 1}
                </span>
                <strong className="text-[0.82rem] text-(--text-main)">{step.title}</strong>
                <span className="app-muted ml-auto text-[0.64rem] uppercase tracking-widest">
                  {step.state === 'done' ? 'Listo' : step.state === 'current' ? 'Ahora' : 'Pend.'}
                </span>
              </div>

              <div className="flex items-end justify-between gap-2">
                <strong className="text-[0.82rem] text-(--text-main)">{step.metric}</strong>
                <small className="app-muted text-[0.68rem] leading-none">{step.detail}</small>
              </div>
            </article>
          ))}
        </div>
      </div>
    </article>
  )
}
