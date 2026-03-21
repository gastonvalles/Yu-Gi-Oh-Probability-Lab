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
        ? 'Buscá cartas a la derecha. Click agrega al Main Deck, arrastrar mueve entre Main, Extra y Side, y click derecho quita.'
        : `Seguí sumando cartas hasta llegar a 40 en el Main Deck. Te faltan ${formatInteger(missingMainDeckCards)}.`
        : activeStep === 2
          ? `En el paso 2 marcá qué hace cada carta. Te faltan ${formatInteger(missingRoleCount)} carta${missingRoleCount === 1 ? '' : 's'} sin rol.`
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
        ? 'Paso actual: marcá roles'
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
      title: 'Roles',
      metric:
        totalClassifiableCards === 0
          ? '0 / 0'
          : `${formatInteger(classifiedCards)} / ${formatInteger(totalClassifiableCards)}`,
      detail:
        totalClassifiableCards === 0
          ? 'Esperando Main Deck.'
          : classifiedCards === totalClassifiableCards
            ? 'Todo marcado.'
            : `${formatInteger(missingRoleCount)} sin rol.`,
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
    <article className="surface-panel-strong p-2">
      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3 max-[820px]:flex-col max-[820px]:items-stretch">
          <div>
            <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Ruta rápida</p>
            <h2 className="m-0 text-[1rem] leading-none">Cómo usar la app</h2>
          </div>

          <div className="surface-card self-start px-2 py-1.5">
            <small className="app-muted block text-[0.68rem] uppercase tracking-[0.08em]">Estado</small>
            <strong className="text-[0.84rem] text-[var(--text-main)]">{overallStatus}</strong>
          </div>
        </div>

        <div className="grid gap-2 min-[980px]:grid-cols-4">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className={[
                'grid gap-1 p-2',
                step.state === 'done' || step.state === 'current'
                  ? 'surface-card-accent'
                  : 'surface-card',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="app-chip-accent grid h-6 w-6 place-items-center text-[0.78rem]">
                  {index + 1}
                </span>
                <strong className="text-[0.86rem] text-[var(--text-main)]">{step.title}</strong>
                <span className="app-muted ml-auto text-[0.68rem] uppercase tracking-[0.08em]">
                  {step.state === 'done' ? 'Listo' : step.state === 'current' ? 'Ahora' : 'Pendiente'}
                </span>
              </div>

              <strong className="text-[0.84rem] text-[var(--text-main)]">{step.metric}</strong>
              <p className="app-muted m-0 text-[0.76rem] leading-[1.16]">{step.detail}</p>
            </article>
          ))}
        </div>

        <div className="surface-card grid gap-1 px-2 py-1.5">
          <strong className="text-[0.78rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">
            {currentStepLabel}
          </strong>
          <p className="m-0 text-[0.76rem] leading-[1.16] text-[var(--text-main)]">{currentMessage}</p>
        </div>
      </div>
    </article>
  )
}
