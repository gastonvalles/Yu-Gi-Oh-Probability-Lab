import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { BUG_AREAS, type BugArea, type BugEnv } from '../../app/bug-report'
import {
  detectEnv,
  EMPTY_DRAFT,
  isTooLarge,
  MAX_TEXT,
  MIN_QUE,
  readDraft,
  REPORT_FIELDS,
  reportBody,
  reportBuild,
  sendReport,
  textLength,
  validateDraft,
  writeDraft,
  type FieldError,
  type ReportDraft,
  type ReportField,
  type ReportResult,
} from '../../app/reportar'
import { t, type MessageKey } from '../../i18n'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { SOURCE_URL } from '../ui/SocialLinks'
import { StepPage } from '../ui/StepPage'
import { field } from '../ui/surfaces'
import { Switch } from '../ui/Switch'
import { textLink } from '../ui/typography'

const AREA_KEYS = {
  Deck: 'reportar.area.deck',
  Roles: 'reportar.area.roles',
  Lab: 'reportar.area.lab',
  Comparar: 'reportar.area.comparar',
  'Jugar solo': 'reportar.area.jugarSolo',
  Duelo: 'reportar.area.duelo',
  Datos: 'reportar.area.datos',
  Otro: 'reportar.area.otro',
} as const satisfies Record<BugArea, MessageKey>

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'failed'; result: Exclude<ReportResult, { kind: 'sent' }> } | Extract<ReportResult, { kind: 'sent' }>

/** Un texto de varias líneas o la lista de áreas: el campo lavanda de la app; con error, el borde y el anillo de foco en rojo (la lima sobre el rojo se veía oliva). */
const control = cx(field, 'w-full px-3 text-body aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgb(var(--danger-rgb)/0.3)]')

function errorText(name: ReportField, error: FieldError | 'server'): string {
  if (error === 'server') return t('reportar.error.server')
  if (error.kind === 'long') return t('reportar.error.long', { max: MAX_TEXT, over: error.over })
  if (name === 'area') return t('reportar.error.area')

  return error.kind === 'short' ? t('reportar.error.queShort', { min: MIN_QUE }) : t('reportar.error.queEmpty')
}

function failText(result: Exclude<ReportResult, { kind: 'sent' }>): string {
  switch (result.kind) {
    case 'rate-limited':
      return t('reportar.fail.rateLimited', { count: result.minutes })
    case 'unavailable':
      return t('reportar.fail.unavailable')
    case 'upstream':
      return t('reportar.fail.upstream')
    case 'too-large':
      return t('reportar.fail.tooLarge')
    case 'network':
      return t('reportar.fail.network')
    case 'invalid':
      return t('reportar.fail.invalid')
  }
}

/** Lo que se manda del navegador: el commit de `/build.json` llega aparte (en local no existe y no se manda). */
function useReportEnv(): BugEnv {
  const [build, setBuild] = useState<string>()

  useEffect(() => {
    let alive = true
    fetch('/build.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: unknown) => alive && setBuild(reportBuild(json)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return detectEnv({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, language: navigator.language, build })
}

interface FieldRowProps {
  id: string
  label: string
  optional?: boolean
  hint?: string
  error?: string
  /** Cuántos caracteres lleva: el contador aparece cerca del tope. */
  length?: number
  children: ReactNode
}

/** Un campo con su rótulo arriba y, debajo, la pista y el error (los dos los lee el lector por `aria-describedby`). */
function FieldRow({ id, label, optional, hint, error, length, children }: FieldRowProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} id={`${id}-label`} className="flex items-baseline gap-2 text-body font-semibold text-foreground">
        {label}
        {optional ? <span className="text-micro font-normal text-soft">{t('reportar.optional')}</span> : null}
      </label>
      {children}
      {hint || error || (length ?? 0) > MAX_TEXT * 0.9 ? (
        <div className="flex items-start justify-between gap-3 text-micro">
          <div className="grid gap-0.5">
            {error ? (
              <p id={`${id}-error`} className="m-0 font-semibold text-danger-soft">
                {error}
              </p>
            ) : null}
            {hint ? (
              <p id={`${id}-hint`} className="m-0 text-soft">
                {hint}
              </p>
            ) : null}
          </div>
          {(length ?? 0) > MAX_TEXT * 0.9 ? <span className={cx('shrink-0 tabular-nums', (length ?? 0) > MAX_TEXT ? 'text-danger-soft' : 'text-soft')}>{t('reportar.count', { n: length ?? 0, max: MAX_TEXT })}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

const describedBy = (id: string, hint: boolean, error: boolean) => [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined

/**
 * Reportar un problema (`#reportar`): un formulario sin cuenta, sin mail y sin nombre que `POST /api/bug` vuelve un issue público de GitHub. Arriba, qué se publica y
 * adónde va una vulnerabilidad; los errores de un campo aparecen recién al intentar enviar (el foco va al primero) y los del servicio, arriba del botón, sin perder lo
 * escrito. El borrador vive en el navegador hasta que se envía.
 */
export function ReportarScreen() {
  const id = useId()
  const [draft, setDraft] = useState(readDraft)
  const [attempted, setAttempted] = useState(false)
  const [serverField, setServerField] = useState<ReportField | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const env = useReportEnv()
  const hpRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  const fieldId = (name: ReportField) => `${id}-${name}`

  useEffect(() => writeDraft(draft), [draft])
  useEffect(() => {
    if (status.kind === 'sent') doneRef.current?.focus()
  }, [status.kind])

  const errors = attempted ? validateDraft(draft) : {}
  const errorOf = (name: ReportField): string | undefined => {
    const error = errors[name] ?? (serverField === name ? 'server' : undefined)

    return error ? errorText(name, error) : undefined
  }
  const set = (patch: Partial<ReportDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    if (serverField && serverField in patch) setServerField(null)
  }
  const focusField = (name: ReportField) => document.getElementById(fieldId(name))?.focus()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (status.kind === 'sending') return
    setAttempted(true)
    const first = REPORT_FIELDS.find((name) => validateDraft(draft)[name])

    if (first) {
      setStatus({ kind: 'idle' })
      focusField(first)
      return
    }
    const body = reportBody(draft, env, hpRef.current?.value ?? '')

    if (isTooLarge(body)) {
      setStatus({ kind: 'failed', result: { kind: 'too-large' } })
      return
    }
    setStatus({ kind: 'sending' })
    const result = await sendReport(body)

    if (result.kind === 'sent') {
      setDraft(EMPTY_DRAFT)
      setAttempted(false)
      setStatus(result)
      return
    }
    setStatus({ kind: 'failed', result })
    if (result.kind === 'invalid' && result.field) {
      setServerField(result.field)
      focusField(result.field)
    }
  }

  const textarea = (name: Exclude<ReportField, 'area'>, rows: number, { hint, placeholder, optional = true }: { hint?: string; placeholder?: string; optional?: boolean } = {}) => {
    const error = errorOf(name)

    return (
      <FieldRow id={fieldId(name)} label={t(`reportar.field.${name}`)} optional={optional} hint={hint} error={error} length={textLength(draft[name])}>
        <textarea
          id={fieldId(name)}
          rows={rows}
          value={draft[name]}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId(name), Boolean(hint), Boolean(error))}
          aria-required={!optional || undefined}
          onChange={(event) => set({ [name]: event.target.value })}
          className={cx(control, 'min-h-24 resize-y py-2 leading-normal placeholder:text-soft')}
        />
      </FieldRow>
    )
  }

  const areaError = errorOf('area')
  const sending = status.kind === 'sending'
  const envLines = [
    env.navegador && t('reportar.env.browser', { value: env.navegador === 'Otro' ? t('reportar.env.other') : env.navegador }),
    env.sistema && t('reportar.env.os', { value: env.sistema === 'Otro' ? t('reportar.env.other') : env.sistema }),
    env.idioma && t('reportar.env.language', { value: env.idioma }),
    env.build && t('reportar.env.build', { value: env.build }),
  ].filter(Boolean)

  return (
    <StepPage as="article">
      <StepHero title={t('reportar.title')} icon="flag" subtitle={t('reportar.subtitle')} />

      <div className="grid w-full max-w-xl gap-4">
        {/* Lo que se publica y adónde va una vulnerabilidad: hace falta antes de escribir, no después de enviar. */}
        {status.kind === 'sent' ? null : (
          <Callout tone="neutral" icon="info">
            <p className="m-0">{t('reportar.notice.public')}</p>
            <p className="m-0 mt-2">
              {t('reportar.notice.security')}{' '}
              <a href={`${SOURCE_URL}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer" className={cx('rounded-control', textLink)}>
                {t('reportar.notice.securityLink')}
              </a>
            </p>
          </Callout>
        )}

        {status.kind === 'sent' ? (
          <div ref={doneRef} tabIndex={-1} className="grid gap-3 rounded-control focus-visible:outline-none focus-visible:shadow-focus">
            <Callout tone="success" title={t('reportar.done.title')}>
              <p className="m-0">{status.url ? t('reportar.done.text') : t('reportar.done.textNoLink')}</p>
              {status.url && status.number ? (
                <a href={status.url} target="_blank" rel="noreferrer" className={cx('inline-flex min-h-11 w-fit items-center rounded-control text-body', textLink)}>
                  {t('reportar.done.link', { number: status.number })}
                </a>
              ) : null}
            </Callout>
            <Button variant="secondary" icon="plus" className="w-fit" onClick={() => setStatus({ kind: 'idle' })}>
              {t('reportar.done.again')}
            </Button>
          </div>
        ) : (
          <Card as="form" aria-label={t('reportar.form')} aria-busy={sending || undefined} onSubmit={(event: FormEvent) => void submit(event)} className="relative grid gap-5">
            {/* i18n-ignore: los nombres de campo del contrato de /api/bug */}
            {textarea('que', 5, { hint: t('reportar.field.queHint', { min: MIN_QUE, max: MAX_TEXT }), optional: false })}
            {textarea('esperaba', 3)}
            {/* i18n-ignore: los nombres de campo del contrato de /api/bug */}
            {textarea('pasos', 4, { placeholder: t('reportar.field.pasosPlaceholder') })}

            <FieldRow id={fieldId('area')} label={t('reportar.field.area')} error={areaError}>
              <select
                id={fieldId('area')}
                value={draft.area}
                aria-invalid={areaError ? true : undefined}
                aria-describedby={describedBy(fieldId('area'), false, Boolean(areaError))}
                aria-required
                onChange={(event) => set({ area: event.target.value as BugArea })}
                className={cx(control, 'h-11 cursor-pointer')}
              >
                <option value="" disabled>
                  {t('reportar.field.areaPick')}
                </option>
                {BUG_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {t(AREA_KEYS[area])}
                  </option>
                ))}
              </select>
            </FieldRow>

            <div className="grid gap-2 border-t border-border-subtle pt-4">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span id={`${id}-env`} className="text-body font-semibold text-foreground">
                  {t('reportar.env.label')}
                </span>
                <Switch checked={draft.includeEnv} onChange={(includeEnv) => set({ includeEnv })} label={t('reportar.env.label')} />
              </div>
              {draft.includeEnv ? (
                <div className="grid gap-1 text-micro text-soft">
                  <p className="m-0">{t('reportar.env.sends')}</p>
                  <ul aria-labelledby={`${id}-env`} className="m-0 grid list-disc gap-0.5 pl-5 text-muted">
                    {envLines.map((line) => (
                      <li key={line as string}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="m-0 text-micro text-soft">{t('reportar.env.off')}</p>
              )}
            </div>

            {/* El honeypot: invisible para personas y lectores de pantalla, sin foco ni autocompletado. Un bot que lo llena recibe un «sí» y no se publica nada. */}
            <div aria-hidden="true" className="sr-only">
              <label>
                {t('reportar.hp')}
                <input ref={hpRef} name="hp" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>

            {status.kind === 'failed' ? (
              <Callout
                tone="danger"
                title={t('reportar.fail.title')}
                action={
                  status.result.kind === 'unavailable' ? (
                    <a href={`${SOURCE_URL}/issues/new/choose`} target="_blank" rel="noreferrer" className={cx('inline-flex min-h-11 w-fit items-center rounded-control text-body', textLink)}>
                      {t('reportar.fail.github')}
                    </a>
                  ) : undefined
                }
              >
                {failText(status.result)}
              </Callout>
            ) : null}

            <Button type="submit" variant="primary" size="lg" icon="send" disabledFocusable={sending} className="w-full min-[1101px]:w-fit min-[1101px]:justify-self-end">
              {sending ? t('reportar.sending') : t('reportar.send')}
            </Button>
          </Card>
        )}
      </div>
    </StepPage>
  )
}
