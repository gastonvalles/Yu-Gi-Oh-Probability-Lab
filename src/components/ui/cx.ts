export type ClassValue = string | false | null | undefined | ClassValue[]

/** Une clases descartando los valores vacíos (`cond && 'clase'`); acepta listas anidadas. */
export function cx(...values: ClassValue[]): string {
  return values
    .flat(Infinity as 1)
    .filter(Boolean)
    .join(' ')
}

type VariantMap = Record<string, Record<string, string>>

interface VariantsConfig<V extends VariantMap> {
  base?: string
  variants: V
  defaults: { [K in keyof V]: keyof V[K] }
}

/** Mini "cva": arma el string de clases según las variantes elegidas (sin dependencias). */
export function variants<V extends VariantMap>({ base = '', variants: map, defaults }: VariantsConfig<V>) {
  return (choice: { [K in keyof V]?: keyof V[K] } = {}, extra?: ClassValue): string =>
    cx(
      base,
      ...(Object.keys(map) as Array<keyof V>).map((key) => map[key][(choice[key] ?? defaults[key]) as string]),
      extra,
    )
}
