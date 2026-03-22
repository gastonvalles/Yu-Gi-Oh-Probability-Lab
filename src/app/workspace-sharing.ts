import type { PortableConfig } from './model'
import { decodeBase64Url, encodeBase64Url } from './utils'

export function serializePortableConfig(config: PortableConfig): string {
  return JSON.stringify(config, null, 2)
}

export function buildSharePayload(config: PortableConfig): string {
  return encodeBase64Url(JSON.stringify(config))
}

export function buildShareUrl(config: PortableConfig): string {
  const sharePayload = buildSharePayload(config)
  return `${window.location.origin}${window.location.pathname}#share=${sharePayload}`
}

export function parseSharePayload(value: string): PortableConfig {
  const normalizedValue = value.trim().replace(/^.*#share=/, '').replace(/^share=/, '')
  return JSON.parse(decodeBase64Url(normalizedValue)) as PortableConfig
}
