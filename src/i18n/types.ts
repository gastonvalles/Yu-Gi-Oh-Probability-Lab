import type { es } from './es'

/** Un mensaje que cambia con la cantidad: en español y en inglés alcanza con `one` (1) y `other` (el resto). */
export interface PluralMessage {
  readonly one: string
  readonly other: string
}

type Source = typeof es

/** Todas las claves de mensajes: el español es la fuente y el inglés tiene que traducir cada una. */
export type MessageKey = keyof Source

/** Las traducciones de un área: las mismas claves que el español, cada una texto o plural según la fuente. */
export type Translated<T> = { [K in keyof T]: T[K] extends string ? string : PluralMessage }

export type Messages = Translated<Source>

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never
type TextOf<V> = V extends string ? V : V extends PluralMessage ? V['one'] | V['other'] : never
type ParamNames<K extends MessageKey> = Placeholders<TextOf<Source[K]>> | (Source[K] extends string ? never : 'count')

/** Los parámetros que pide un mensaje: uno por cada `{nombre}` de su texto (y `count` si es plural). */
export type MessageArgs<K extends MessageKey> = [ParamNames<K>] extends [never] ? [] : [params: { [P in ParamNames<K>]: string | number }]
