import { CARD_ORIGIN_DEFINITIONS, getCardRoleDefinition, serializeGroupKey } from '../../app/deck-groups'
import { formatInteger } from '../../app/utils'
import type { CardEntry, CardOrigin, CardRole } from '../../types'
import { originOption, roleOptionButton, ROLE_REFERENCE_MARK } from '../classification-styles'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { chip, surface } from '../ui/surfaces'
import { ORIGIN_BLURB_TEXT, ORIGIN_HELP_TEXT, ROLE_EDITOR_SECTIONS, ROLE_HELP_TEXT } from './classification-copy'
import { CARD_TYPE_LABEL, getCardType, getClassificationStyle } from './classification-model'

interface ClassificationEditorProps {
  card: CardEntry
  position: number
  total: number
  completed: number
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirm: (ygoprodeckId: number) => void
  onOpenHelp?: () => void
}

const KICKER = 'm-0 text-micro font-semibold uppercase tracking-widest text-accent'

/** Edición de una carta: dónde encaja (origen) y qué función cumple (roles). */
export function ClassificationEditor({
  card,
  position,
  total,
  completed,
  onSetOrigin,
  onToggleRole,
  onConfirm,
  onOpenHelp,
}: ClassificationEditorProps) {
  const ygoprodeckId = card.apiCard?.ygoprodeckId ?? 0
  const percent = total > 0 ? completed / total : 0
  const selectedOrigin = card.origin
  const needsConfirm = card.needsReview && card.origin !== null && card.roles.length > 0

  return (
    <div className="grid gap-4 min-[1101px]:grid-cols-[15rem_minmax(0,1fr)] min-[1101px]:items-start min-[1101px]:gap-6">
      <div className="hidden aspect-[268/391] overflow-hidden rounded-tag bg-input min-[1101px]:block">
        <CardArt
          remoteUrl={card.apiCard?.imageUrl ?? card.apiCard?.imageUrlSmall ?? null}
          name={card.name}
          className="block h-full w-full object-cover"
          limitCard={card.apiCard}
        />
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <header className="flex items-start gap-3 pr-10">
          <div className="aspect-[268/391] w-[5.25rem] shrink-0 overflow-hidden rounded-tag bg-input min-[1101px]:hidden">
            <CardArt
              remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
              name={card.name}
              className="block h-full w-full object-cover"
              limitCard={card.apiCard}
              limitBadgeSize="sm"
            />
          </div>
          <div className="grid min-w-0 gap-1">
            <p className={KICKER}>
              Carta {formatInteger(position)} de {formatInteger(total)}
            </p>
            <h3 className="m-0 text-title tracking-[-0.01em] text-foreground [overflow-wrap:anywhere] min-[1101px]:text-title">
              {card.name}
            </h3>
            <p className="m-0 text-small leading-tight text-muted min-[1101px]:text-body">
              {CARD_TYPE_LABEL[getCardType(card)].singular} · {formatInteger(card.copies)} copia{card.copies === 1 ? '' : 's'} en el Main
            </p>
          </div>
        </header>

        <div
          className="h-1 w-full overflow-hidden rounded-full bg-[rgb(var(--border-rgb)/0.9)]"
          role="progressbar"
          aria-label="Cartas clasificadas"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div className="h-full origin-left rounded-full bg-accent transition-transform" style={{ transform: `scaleX(${percent})` }} />
        </div>

        {needsConfirm ? (
          <div className={cx(surface.cardWarning, 'flex flex-wrap items-center justify-between gap-2 px-3 py-2.5')}>
            <p className="m-0 min-w-0 flex-1 text-small text-foreground">
              Clasificación sugerida automáticamente. Confirmala si te parece correcta.
            </p>
            <Button variant="primary" size="sm" onClick={() => onConfirm(ygoprodeckId)}>
              Confirmar
            </Button>
          </div>
        ) : null}

        <section className="grid gap-2" aria-label="Origen">
          <p className={KICKER}>¿Dónde encaja en tu plan?</p>
          <div className="grid gap-1.5 min-[1101px]:grid-cols-3 min-[1101px]:gap-2">
            {CARD_ORIGIN_DEFINITIONS.map((definition) => {
              const active = selectedOrigin === definition.key.value
              const muted = selectedOrigin !== null && !active

              return (
                <button
                  key={serializeGroupKey(definition.key)}
                  type="button"
                  aria-pressed={active}
                  title={ORIGIN_HELP_TEXT[definition.key.value]}
                  className={cx(
                    originOption({ active, muted }),
                    'grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 rounded-card px-3 py-2 text-left min-[1101px]:min-h-[4.25rem] min-[1101px]:grid-cols-1 min-[1101px]:content-center min-[1101px]:justify-items-start',
                  )}
                  style={getClassificationStyle(definition.key)}
                  onClick={() => onSetOrigin(ygoprodeckId, definition.key.value)}
                >
                  <span className="flex min-w-0 items-center gap-2 min-[1101px]:contents">
                    <span className={ROLE_REFERENCE_MARK} />
                    <strong className="truncate text-body leading-none text-foreground min-[1101px]:text-small">{definition.shortLabel ?? definition.label}</strong>
                  </span>
                  <span className="min-w-0 text-micro text-muted max-[1100px]:text-right min-[1101px]:text-micro">{ORIGIN_BLURB_TEXT[definition.key.value]}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid gap-3" aria-label="Roles">
          <div className="flex items-center justify-between gap-2">
            <p className={KICKER}>¿Qué función cumple cuando la robás?</p>
            {onOpenHelp ? (
              <button
                type="button"
                className="shrink-0 rounded-full px-1 text-caption font-semibold text-muted underline underline-offset-2 hover:text-foreground"
                onClick={onOpenHelp}
              >
                ¿Qué significa cada rol?
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 min-[1101px]:grid-cols-3 min-[1101px]:gap-2">
            {ROLE_EDITOR_SECTIONS.map((section) => {
              const selectedCount = section.roles.reduce((sum, role) => sum + (card.roles.includes(role) ? 1 : 0), 0)

              return (
                <div key={section.title} className="grid content-start gap-2 min-[1101px]:rounded-card min-[1101px]:border min-[1101px]:border-border min-[1101px]:bg-secondary/40 min-[1101px]:p-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-small leading-none text-foreground">{section.title}</strong>
                    <span className={cx(chip.base, 'px-1.5 py-0.5 text-micro leading-none tabular-nums')}>
                      {selectedCount} / {section.roles.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {section.roles.map((role) => {
                      const definition = getCardRoleDefinition(role)
                      const active = card.roles.includes(role)

                      return (
                        <button
                          key={serializeGroupKey(definition.key)}
                          type="button"
                          aria-pressed={active}
                          title={ROLE_HELP_TEXT[role]}
                          className={cx(roleOptionButton(active), 'min-h-10 px-3.5 py-1.5 text-small leading-none min-[1101px]:min-h-8 min-[1101px]:px-2.5 min-[1101px]:text-caption')}
                          style={getClassificationStyle(definition.key)}
                          onClick={() => onToggleRole(ygoprodeckId, role)}
                        >
                          {definition.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}


