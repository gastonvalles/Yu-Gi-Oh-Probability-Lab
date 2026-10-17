import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

export const MAX_DIGITS = 6

/** Teclas y acciones: grandes, sin retardo táctil y con respuesta inmediata al apretar. */
export const PRESSABLE =
  'touch-manipulation select-none rounded-control font-semibold text-foreground transition-[background-color,transform,color] duration-100 focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-35 [-webkit-tap-highlight-color:transparent]'

/** Lo que se aprieta en el teclado: un dígito, el signo (restar o sumar), la mitad o borrar el último dígito. «=» no es una tecla: se aplica con `onApply`. */
export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '+' | '-' | '÷2' | 'back'

const KEY = cx(PRESSABLE, 'min-h-14 border border-border bg-input active:bg-surface-hover')

interface LpPadProps {
  operator: '-' | '+'
  /** A quién se le aplica (lo dice el rótulo de la mitad). */
  name: string
  /** El monto ya interpretado: con cero, «=» está apagado. */
  amount: number
  /** Lo que dice «=» para el lector de pantalla («Aplicar: restar 1200 a Vos»). */
  applyLabel: string
  onKey: (key: PadKey) => void
  onApply: () => void
}

/**
 * El teclado de la calculadora de LP, igual en la herramienta y en la hoja de vidas de un duelo: tres columnas de dígitos (7-8-9, 4-5-6, 1-2-3, y la mitad, el 0 y borrar) y una de
 * operaciones a la derecha (restar, sumar y «=», que ocupa dos filas). El signo elegido va en violeta; con menos de tres cifras el monto se entiende en centenas.
 */
export function LpPad({ operator, name, amount, applyLabel, onKey, onApply }: LpPadProps) {
  const digit = (key: PadKey) => (
    <button key={key} type="button" className={cx(KEY, 'text-stat tabular-nums')} onClick={() => onKey(key)}>
      {key}
    </button>
  )
  const sign = (key: '-' | '+') => (
    <button
      key={key}
      type="button"
      className={cx(KEY, 'text-stat', operator === key && 'border-primary bg-primary text-primary-foreground active:bg-primary-hover')}
      aria-label={t(key === '-' ? 'shell.life.key.subtract' : 'shell.life.key.add')}
      aria-pressed={operator === key}
      onClick={() => onKey(key)}
    >
      {key === '-' ? '−' : '+'}
    </button>
  )

  return (
    <div role="group" aria-label={t('shell.life.keypad')} className="grid grid-cols-[repeat(3,minmax(0,1fr))_4rem] gap-1.5">
      {digit('7')}
      {digit('8')}
      {digit('9')}
      {sign('-')}
      {digit('4')}
      {digit('5')}
      {digit('6')}
      {sign('+')}
      {digit('1')}
      {digit('2')}
      {digit('3')}
      <button
        type="button"
        className={cx(PRESSABLE, 'row-span-2 border border-primary bg-primary text-stat text-primary-foreground shadow-brand active:bg-primary-hover')}
        disabled={amount === 0}
        aria-label={applyLabel}
        onClick={onApply}
      >
        =
      </button>
      <button type="button" className={cx(KEY, 'text-lead')} aria-label={t('shell.life.key.half', { name })} onClick={() => onKey('÷2')}>
        ½
      </button>
      {digit('0')}
      <button type="button" className={KEY} aria-label={t('shell.life.key.clearLabel')} onClick={() => onKey('back')}>
        <Icon name="backspace" size={22} className="mx-auto" />
      </button>
    </div>
  )
}
