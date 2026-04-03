export const TRYSTERO_APP_ID = (import.meta.env.VITE_TRYSTERO_APP_ID || 'plasmodium').trim()

export const PLASMODIUM_ACTIONS = {
  presence: 'plasmodium:presence',
  chat: 'plasmodium:chat',
  mediaState: 'plasmodium:media-state',
  typing: 'plasmodium:typing'
} as const

export type WalletMode = 'Ethereum wallet' | 'Guest'
export type MediaRole = 'viewer' | 'broadcaster'

export type PeerRecord = {
  from: string
  address: string
  peerId: string
  walletMode: WalletMode | null
  displayName?: string
  avatarHue?: number
  role: MediaRole
  audioEnabled: boolean
  videoEnabled: boolean
  kind?: 'announce' | 'leave'
}

export type PresencePayload = PeerRecord & {
  room: string
  issuedAt: string
}

export type ChatPayload = {
  id: string
  from: string
  address: string
  displayName?: string
  room: string
  text: string
  issuedAt: string
}

export type MediaStatePayload = {
  from: string
  room: string
  role: MediaRole
  audioEnabled: boolean
  videoEnabled: boolean
  issuedAt: string
}

export type TypingPayload = {
  from: string
  room: string
  displayName?: string
  issuedAt: string
  active: boolean
}

export type RemoteStreamRecord = {
  id: string
  peerId: string
  stream: MediaStream
}

export function readRoomFromUrl() {
  return new URLSearchParams(window.location.search).get('room') || null
}

export function makeRoomName() {
  return `room-${crypto.randomUUID().slice(0, 8)}`
}

export function formatAddress(address: string | null) {
  if (!address) return 'Disconnected'
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export function makeChatId() {
  return crypto.randomUUID()
}

export function fallbackDisplayName(address: string | null, displayName?: string | null) {
  if (displayName?.trim()) return displayName.trim()
  if (!address) return 'Guest'
  return formatAddress(address)
}
