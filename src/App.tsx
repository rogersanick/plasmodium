import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { joinRoom as joinTrysteroRoom, selfId } from 'trystero'
import { startPhysarumBackground } from './physarum/startPhysarumBackground'
import {
  formatAddress,
  makeChatId,
  makeRoomName,
  type ChatPayload,
  type MediaRole,
  type MediaStatePayload,
  type PeerRecord,
  type PresencePayload,
  type RemoteStreamRecord,
  readRoomFromUrl,
  TRYSTERO_APP_ID,
  PLASMODIUM_ACTIONS
} from './lib/plasmodiumProtocol'

type RealtimeRoom = ReturnType<typeof joinTrysteroRoom>
type PresenceSender = (payload: PresencePayload, targetPeers?: string | string[] | null) => Promise<void>
type ChatSender = (payload: ChatPayload, targetPeers?: string | string[] | null) => Promise<void>
type MediaStateSender = (payload: MediaStatePayload, targetPeers?: string | string[] | null) => Promise<void>

type ChatMessage = {
  id: string
  from: string
  address: string
  text: string
  issuedAt: string
  self: boolean
}

type MutableAppState = {
  address: string | null
  walletMode: PeerRecord['walletMode']
  anonymousWallet: ethers.HDNodeWallet | ethers.Wallet | null
  appPeerId: string | null
  room: string | null
  localStream: MediaStream | null
  remoteStreams: Map<string, RemoteStreamRecord>
  peers: Map<string, PeerRecord>
  realtimeRoom: RealtimeRoom | null
  presenceSender: PresenceSender | null
  chatSender: ChatSender | null
  mediaStateSender: MediaStateSender | null
  streamPublishedRoom: string | null
  loginBusy: boolean
  hasPromptedForMedia: boolean
  role: MediaRole
  audioEnabled: boolean
  videoEnabled: boolean
  chat: ChatMessage[]
}

type UiState = {
  address: string | null
  walletMode: PeerRecord['walletMode']
  appPeerId: string | null
  room: string | null
  localStream: MediaStream | null
  remoteStreams: RemoteStreamRecord[]
  peers: PeerRecord[]
  loginBusy: boolean
  logs: string[]
  role: MediaRole
  audioEnabled: boolean
  videoEnabled: boolean
  chat: ChatMessage[]
}

function VideoTile({
  stream,
  title,
  subtitle,
  muted = false,
  badge
}: {
  stream: MediaStream
  title: string
  subtitle?: string
  muted?: boolean
  badge?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <figure className="relative m-0 overflow-hidden rounded-[28px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90">
      {badge ? (
        <div className="absolute right-4 top-4 z-10 rounded-full border border-white/14 bg-black/38 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/72 backdrop-blur-md">
          {badge}
        </div>
      ) : null}
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        className="aspect-video min-h-[220px] w-full rounded-[22px] border border-white/10 bg-black/60 object-cover"
      />
      <figcaption className="px-2 pb-1 pt-3">
        <div className="truncate text-sm text-white/78">{title}</div>
        {subtitle ? <div className="truncate pt-1 text-xs text-white/46">{subtitle}</div> : null}
      </figcaption>
    </figure>
  )
}

function PresenceDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        active ? 'bg-[#98f9d9] shadow-[0_0_14px_rgba(152,249,217,0.9)]' : 'bg-white/28'
      }`}
    />
  )
}

function AvatarBadge({ label, active = false, large = false }: { label: string; active?: boolean; large?: boolean }) {
  return (
    <div
      className={`grid place-items-center rounded-full border text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_16px_40px_rgba(0,0,0,0.22)] ${
        large ? 'h-20 w-20 text-2xl' : 'h-11 w-11 text-sm'
      } ${
        active
          ? 'border-emerald-200/40 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.48),rgba(175,255,230,0.2)_36%,rgba(255,255,255,0.08))]'
          : 'border-white/18 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.3),rgba(175,205,255,0.18)_36%,rgba(255,255,255,0.08))]'
      }`}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  )
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [roomDraft, setRoomDraft] = useState(() => readRoomFromUrl() ?? '')
  const [chatDraft, setChatDraft] = useState('')
  const [callNotice, setCallNotice] = useState<string | null>(null)

  const stateRef = useRef<MutableAppState>({
    address: null,
    walletMode: null,
    anonymousWallet: null,
    appPeerId: null,
    room: readRoomFromUrl(),
    localStream: null,
    remoteStreams: new Map(),
    peers: new Map(),
    realtimeRoom: null,
    presenceSender: null,
    chatSender: null,
    mediaStateSender: null,
    streamPublishedRoom: null,
    loginBusy: false,
    hasPromptedForMedia: false,
    role: 'viewer',
    audioEnabled: true,
    videoEnabled: true,
    chat: []
  })

  const [ui, setUi] = useState<UiState>({
    address: null,
    walletMode: null,
    appPeerId: null,
    room: readRoomFromUrl(),
    localStream: null,
    remoteStreams: [],
    peers: [],
    loginBusy: false,
    logs: [],
    role: 'viewer',
    audioEnabled: true,
    videoEnabled: true,
    chat: []
  })

  const syncUi = useCallback(() => {
    const state = stateRef.current
    setUi((current) => ({
      ...current,
      address: state.address,
      walletMode: state.walletMode,
      appPeerId: state.appPeerId,
      room: state.room,
      localStream: state.localStream,
      remoteStreams: [...state.remoteStreams.values()],
      peers: [...state.peers.values()],
      loginBusy: state.loginBusy,
      role: state.role,
      audioEnabled: state.audioEnabled,
      videoEnabled: state.videoEnabled,
      chat: state.chat
    }))
  }, [])

  const log = useCallback((message: string, payload?: unknown) => {
    const line = `[${new Date().toLocaleTimeString()}] ${message}${payload === undefined ? '' : ` ${JSON.stringify(payload)}`}`
    setUi((current) => ({ ...current, logs: [line, ...current.logs] }))
  }, [])

  const appendChatMessage = useCallback((message: ChatMessage) => {
    const state = stateRef.current
    const existing = state.chat.find((entry) => entry.id === message.id)
    if (existing) return
    state.chat = [message, ...state.chat].slice(0, 100)
    syncUi()
  }, [syncUi])

  const clearRemoteState = useCallback(() => {
    const state = stateRef.current
    state.remoteStreams.clear()
    syncUi()
  }, [syncUi])

  const upsertPeer = useCallback((peer: PeerRecord) => {
    const state = stateRef.current
    const previous = state.peers.get(peer.from)
    state.peers.set(peer.from, {
      ...previous,
      ...peer
    })
    syncUi()
  }, [syncUi])

  const removePeerByAppPeerId = useCallback((appPeerId: string) => {
    const state = stateRef.current
    const peer = state.peers.get(appPeerId)
    if (peer) {
      for (const [streamId, record] of state.remoteStreams.entries()) {
        if (record.peerId === peer.peerId) {
          state.remoteStreams.delete(streamId)
        }
      }
    }
    state.peers.delete(appPeerId)
    syncUi()
  }, [syncUi])

  const makePresencePayload = useCallback((kind: 'announce' | 'leave' = 'announce'): PresencePayload | null => {
    const state = stateRef.current
    if (!state.appPeerId || !state.address || !state.room) return null
    return {
      kind,
      room: state.room,
      from: state.appPeerId,
      address: state.address,
      walletMode: state.walletMode,
      peerId: selfId,
      role: state.role,
      audioEnabled: state.audioEnabled,
      videoEnabled: state.videoEnabled,
      issuedAt: new Date().toISOString()
    }
  }, [])

  const publishPresence = useCallback(async (targetPeers?: string | string[] | null, kind: 'announce' | 'leave' = 'announce') => {
    const state = stateRef.current
    const payload = makePresencePayload(kind)
    if (!payload || !state.presenceSender) return
    await state.presenceSender(payload, targetPeers)
  }, [makePresencePayload])

  const publishMediaState = useCallback(async (targetPeers?: string | string[] | null) => {
    const state = stateRef.current
    if (!state.mediaStateSender || !state.appPeerId || !state.room) return

    await state.mediaStateSender(
      {
        from: state.appPeerId,
        room: state.room,
        role: state.role,
        audioEnabled: state.audioEnabled,
        videoEnabled: state.videoEnabled,
        issuedAt: new Date().toISOString()
      },
      targetPeers
    )
  }, [])

  const publishLocalStream = useCallback(async (targetPeers?: string | string[] | null) => {
    const state = stateRef.current
    if (!state.realtimeRoom || !state.localStream || !state.room) return

    if (targetPeers) {
      state.realtimeRoom.addStream(state.localStream, targetPeers)
      return
    }

    if (state.streamPublishedRoom === state.room) return
    state.realtimeRoom.addStream(state.localStream)
    state.streamPublishedRoom = state.room
  }, [])

  const syncTrackFlags = useCallback(() => {
    const state = stateRef.current
    const audioTrack = state.localStream?.getAudioTracks()[0]
    const videoTrack = state.localStream?.getVideoTracks()[0]
    state.audioEnabled = audioTrack ? audioTrack.enabled : state.audioEnabled
    state.videoEnabled = videoTrack ? videoTrack.enabled : state.videoEnabled
    syncUi()
  }, [syncUi])

  const ensureMedia = useCallback(async () => {
    const state = stateRef.current
    if (state.localStream) return state.localStream

    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    syncTrackFlags()
    log('Camera and microphone ready')

    if (state.room && state.realtimeRoom) {
      await publishLocalStream()
      await publishPresence()
      await publishMediaState()
    }

    return state.localStream
  }, [log, publishLocalStream, publishMediaState, publishPresence, syncTrackFlags])

  const maybePromptMedia = useCallback(async () => {
    const state = stateRef.current
    if (!state.room || state.hasPromptedForMedia) return

    state.hasPromptedForMedia = true
    syncUi()

    try {
      await ensureMedia()
    } catch (error) {
      state.hasPromptedForMedia = false
      log(`Media access failed: ${(error as Error).message}`)
      syncUi()
    }
  }, [ensureMedia, log, syncUi])

  const closeRealtimeRoom = useCallback((options?: { clearRoom?: boolean; logLeave?: boolean; notice?: string | null }) => {
    const state = stateRef.current
    const roomName = state.room

    void publishPresence(undefined, 'leave').catch(() => {})

    if (state.realtimeRoom) {
      state.realtimeRoom.leave()
    }

    state.realtimeRoom = null
    state.presenceSender = null
    state.chatSender = null
    state.mediaStateSender = null
    state.peers.clear()
    state.streamPublishedRoom = null
    state.hasPromptedForMedia = false
    state.role = 'viewer'
    clearRemoteState()

    if (options?.clearRoom) {
      state.room = null
      window.history.replaceState({}, '', window.location.pathname)
    }

    if (options?.notice !== undefined) {
      setCallNotice(options.notice)
    }

    syncUi()

    if (options?.logLeave && roomName) {
      log('Left room', { room: roomName })
    }
  }, [clearRemoteState, log, publishPresence, syncUi])

  const joinRoom = useCallback(async (roomName?: string | null) => {
    const room = (roomName || stateRef.current.room || makeRoomName()).trim()
    if (!room) return

    const state = stateRef.current
    if (!state.appPeerId || !state.address) {
      log('Sign in before joining a room')
      return
    }

    if (state.realtimeRoom) {
      closeRealtimeRoom()
    }

    const realtimeRoom = joinTrysteroRoom({ appId: TRYSTERO_APP_ID }, room)
    const [sendPresence, getPresence] = realtimeRoom.makeAction<PresencePayload>(PLASMODIUM_ACTIONS.presence)
    const [sendChat, getChat] = realtimeRoom.makeAction<ChatPayload>(PLASMODIUM_ACTIONS.chat)
    const [sendMediaState, getMediaState] = realtimeRoom.makeAction<MediaStatePayload>(PLASMODIUM_ACTIONS.mediaState)

    realtimeRoom.onPeerJoin((peerId) => {
      const currentState = stateRef.current
      if (currentState.localStream) {
        realtimeRoom.addStream(currentState.localStream, peerId)
      }
      void publishPresence(peerId)
      void publishMediaState(peerId)
    })

    realtimeRoom.onPeerLeave((peerId) => {
      const currentState = stateRef.current
      for (const [appPeerId, peer] of currentState.peers.entries()) {
        if (peer.peerId === peerId) {
          removePeerByAppPeerId(appPeerId)
          log('Someone left the room', { address: peer.address, peerId: appPeerId })
        }
      }
    })

    realtimeRoom.onPeerStream((stream, peerId) => {
      const currentState = stateRef.current
      currentState.remoteStreams.set(`${peerId}:${stream.id}`, {
        id: `${peerId}:${stream.id}`,
        peerId,
        stream
      })
      setCallNotice(null)
      syncUi()
    })

    getPresence((payload) => {
      const currentState = stateRef.current
      if (!payload?.from || payload.from === currentState.appPeerId) return

      if (payload.kind === 'leave') {
        removePeerByAppPeerId(payload.from)
        return
      }

      const knownPeer = currentState.peers.get(payload.from)
      upsertPeer(payload)
      if (!knownPeer) {
        log('Someone joined the room', { address: payload.address, peerId: payload.from })
      }
    })

    getChat((payload) => {
      const currentState = stateRef.current
      if (!payload?.id || payload.from === currentState.appPeerId) return
      appendChatMessage({
        id: payload.id,
        from: payload.from,
        address: payload.address,
        text: payload.text,
        issuedAt: payload.issuedAt,
        self: false
      })
    })

    getMediaState((payload) => {
      const currentState = stateRef.current
      if (!payload?.from || payload.from === currentState.appPeerId) return
      const existing = currentState.peers.get(payload.from)
      if (!existing) return
      upsertPeer({
        ...existing,
        role: payload.role,
        audioEnabled: payload.audioEnabled,
        videoEnabled: payload.videoEnabled
      })
    })

    setCallNotice(null)
    state.room = room
    state.realtimeRoom = realtimeRoom
    state.presenceSender = async (payload, targetPeers) => {
      await sendPresence(payload, targetPeers)
    }
    state.chatSender = async (payload, targetPeers) => {
      await sendChat(payload, targetPeers)
    }
    state.mediaStateSender = async (payload, targetPeers) => {
      await sendMediaState(payload, targetPeers)
    }
    state.peers.clear()
    state.chat = []
    state.streamPublishedRoom = null
    clearRemoteState()
    window.history.replaceState({}, '', `${window.location.pathname}?room=${encodeURIComponent(room)}`)
    syncUi()
    setRoomDraft(room)
    log('Joined room', { room })
    await publishPresence()
    await publishMediaState()
    await maybePromptMedia()
  }, [appendChatMessage, clearRemoteState, closeRealtimeRoom, log, maybePromptMedia, publishMediaState, publishPresence, removePeerByAppPeerId, syncUi, upsertPeer])

  const proveWalletOwnership = useCallback(async (address: string, signer: (message: string) => Promise<string>, walletMode: PeerRecord['walletMode']) => {
    const proofMessage = [
      'Plasmodium identity proof',
      '',
      'Sign this message to prove you control this wallet for peer-to-peer calling.',
      `Address: ${address}`,
      `Issued at: ${new Date().toISOString()}`
    ].join('\n')

    const signature = await signer(proofMessage)
    const recoveredAddress = ethers.verifyMessage(proofMessage, signature)

    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Wallet signature did not match the selected address')
    }

    stateRef.current.address = address
    stateRef.current.walletMode = walletMode
    stateRef.current.appPeerId = crypto.randomUUID()
    syncUi()
    log('Identity proof complete', { address, walletMode })

    if (stateRef.current.room) {
      await joinRoom(stateRef.current.room)
    }
  }, [joinRoom, log, syncUi])

  const resetAuthSession = useCallback(() => {
    stateRef.current.appPeerId = null
    stateRef.current.room = readRoomFromUrl()
    stateRef.current.peers.clear()
    stateRef.current.chat = []
    stateRef.current.hasPromptedForMedia = false
    stateRef.current.realtimeRoom = null
    stateRef.current.presenceSender = null
    stateRef.current.chatSender = null
    stateRef.current.mediaStateSender = null
    stateRef.current.streamPublishedRoom = null
    stateRef.current.role = 'viewer'
    clearRemoteState()
    syncUi()
  }, [clearRemoteState, syncUi])

  const setLoginBusy = useCallback((busy: boolean) => {
    stateRef.current.loginBusy = busy
    syncUi()
  }, [syncUi])

  useEffect(() => {
    if (!canvasRef.current) return

    let backgroundHandle: { destroy(): void } | null = null

    try {
      backgroundHandle = startPhysarumBackground({ canvas: canvasRef.current })
    } catch (error) {
      console.error('Physarum background failed to start', error)
    }

    return () => {
      backgroundHandle?.destroy()
    }
  }, [])

  useEffect(() => {
    setLoginBusy(false)
    syncUi()
    log('App ready')

    if (stateRef.current.appPeerId && stateRef.current.room && !stateRef.current.realtimeRoom) {
      void joinRoom(stateRef.current.room)
    }

    return () => {
      const state = stateRef.current
      void publishPresence(undefined, 'leave').catch(() => {})

      if (state.realtimeRoom) {
        state.realtimeRoom.leave()
      }

      clearRemoteState()

      if (state.localStream) {
        for (const track of state.localStream.getTracks()) {
          track.stop()
        }
      }
    }
  }, [clearRemoteState, joinRoom, log, publishPresence, setLoginBusy, syncUi])

  const otherPeers = useMemo(() => ui.peers.filter((peer) => peer.from !== ui.appPeerId), [ui.appPeerId, ui.peers])
  const remoteStreams = useMemo(() => ui.remoteStreams, [ui.remoteStreams])
  const hasWallet = typeof window !== 'undefined' && Boolean(window.ethereum)
  const broadcasterCount = useMemo(() => otherPeers.filter((peer) => peer.role === 'broadcaster').length + (ui.role === 'broadcaster' ? 1 : 0), [otherPeers, ui.role])
  const viewerCount = useMemo(() => Math.max((otherPeers.length + (ui.room ? 1 : 0)) - broadcasterCount, 0), [broadcasterCount, otherPeers.length, ui.room])
  const presenceCount = otherPeers.length + (ui.room ? 1 : 0)

  const callStatus = useMemo(() => {
    if (!ui.room) return 'Join a room to start your call.'
    if (callNotice) return callNotice
    if (!ui.localStream) return 'Getting your camera and microphone ready...'
    if (otherPeers.length === 0) return 'You’re the first one here. Share the room link to invite someone in.'
    if (remoteStreams.length > 0) {
      return `${remoteStreams.length} live ${remoteStreams.length === 1 ? 'video feed is' : 'video feeds are'} on screen.`
    }
    if (broadcasterCount > 0 && ui.role !== 'broadcaster') {
      return `${broadcasterCount} ${broadcasterCount === 1 ? 'person is' : 'people are'} on camera right now.`
    }
    return `${otherPeers.length} ${otherPeers.length === 1 ? 'other person is' : 'other people are'} in the room.`
  }, [broadcasterCount, callNotice, otherPeers.length, remoteStreams.length, ui.localStream, ui.role, ui.room])

  const peerLookupByPeerId = useMemo(() => new Map(otherPeers.map((peer) => [peer.peerId, peer])), [otherPeers])

  const remoteTiles = useMemo(() => remoteStreams.map((record) => ({ ...record, peer: peerLookupByPeerId.get(record.peerId) ?? null })), [peerLookupByPeerId, remoteStreams])
  const stageTiles = useMemo(() => {
    const localTile = ui.localStream
      ? [{
          id: 'local',
          stream: ui.localStream,
          title: 'You',
          subtitle: `${formatAddress(ui.address)} · ${ui.audioEnabled ? 'mic on' : 'mic off'} · ${ui.videoEnabled ? 'camera on' : 'camera off'}`,
          badge: ui.role === 'broadcaster' ? 'live' : 'you',
          muted: true
        }]
      : []

    const remoteVideoTiles = remoteTiles.map((record) => ({
      id: record.id,
      stream: record.stream,
      title: record.peer?.address ?? 'Guest',
      subtitle: `${record.peer?.audioEnabled ? 'mic on' : 'mic off'} · ${record.peer?.videoEnabled ? 'camera on' : 'camera off'}`,
      badge: record.peer?.role === 'broadcaster' ? 'live' : 'guest',
      muted: false
    }))

    return [...remoteVideoTiles, ...localTile]
  }, [remoteTiles, ui.address, ui.audioEnabled, ui.localStream, ui.role, ui.videoEnabled])
  const stageGridClass = useMemo(() => {
    if (stageTiles.length <= 1) return 'grid-cols-1'
    if (stageTiles.length === 2) return 'grid-cols-1 xl:grid-cols-2'
    return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2'
  }, [stageTiles.length])

  const shareLink = useCallback(() => {
    const url = new URL(window.location.href)
    if (stateRef.current.room) {
      url.searchParams.set('room', stateRef.current.room)
    }
    return url.toString()
  }, [])

  const handleWalletLogin = useCallback(async () => {
    try {
      if (!window.ethereum) {
        return
      }

      setLoginBusy(true)
      resetAuthSession()
      stateRef.current.anonymousWallet = null

      const [address] = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]

      await proveWalletOwnership(address, async (message) => {
        return (await window.ethereum?.request({
          method: 'personal_sign',
          params: [message, address]
        })) as string
      }, 'Ethereum wallet')
    } catch (error) {
      log(`Login failed: ${(error as Error).message}`)
    } finally {
      setLoginBusy(false)
    }
  }, [log, proveWalletOwnership, resetAuthSession, setLoginBusy])

  const handleAnonymousLogin = useCallback(async () => {
    try {
      setLoginBusy(true)
      resetAuthSession()

      const anonymousWallet = ethers.Wallet.createRandom()
      stateRef.current.anonymousWallet = anonymousWallet

      await proveWalletOwnership(anonymousWallet.address, (message) => anonymousWallet.signMessage(message), 'Guest')
    } catch (error) {
      log(`Guest sign-in failed: ${(error as Error).message}`)
    } finally {
      setLoginBusy(false)
    }
  }, [log, proveWalletOwnership, resetAuthSession, setLoginBusy])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink())
      log('Copied room link')
    } catch (error) {
      log(`Copy failed: ${(error as Error).message}`)
    }
  }, [log, shareLink])

  const handleLeaveRoom = useCallback(() => {
    setCallNotice(null)
    closeRealtimeRoom({ clearRoom: true, logLeave: true })
  }, [closeRealtimeRoom])

  const handleSwitchIdentity = useCallback(() => {
    const state = stateRef.current
    setCallNotice(null)
    if (state.room) {
      closeRealtimeRoom({ clearRoom: true })
    }

    resetAuthSession()
    state.address = null
    state.walletMode = null
    state.anonymousWallet = null

    if (state.localStream) {
      for (const track of state.localStream.getTracks()) {
        track.stop()
      }
      state.localStream = null
    }

    window.history.replaceState({}, '', window.location.pathname)
    syncUi()
    log('Signed out')
  }, [closeRealtimeRoom, log, resetAuthSession, syncUi])

  const handleJoinRoom = useCallback(async () => {
    await joinRoom(roomDraft)
  }, [joinRoom, roomDraft])

  const handleToggleBroadcast = useCallback(async () => {
    const state = stateRef.current
    if (state.role === 'broadcaster') {
      state.role = 'viewer'
      await publishPresence()
      await publishMediaState()
      syncUi()
      return
    }

    await ensureMedia()
    state.role = 'broadcaster'
    await publishLocalStream()
    await publishPresence()
    await publishMediaState()
    syncUi()
  }, [ensureMedia, publishLocalStream, publishMediaState, publishPresence, syncUi])

  const handleToggleTrack = useCallback(async (kind: 'audio' | 'video') => {
    const state = stateRef.current
    await ensureMedia()
    const track = kind === 'audio' ? state.localStream?.getAudioTracks()[0] : state.localStream?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    syncTrackFlags()
    await publishPresence()
    await publishMediaState()
    log(`${kind === 'audio' ? 'Microphone' : 'Camera'} ${track.enabled ? 'enabled' : 'muted'}`)
  }, [ensureMedia, log, publishMediaState, publishPresence, syncTrackFlags])

  const handleSendChat = useCallback(async () => {
    const state = stateRef.current
    const text = chatDraft.trim()
    if (!text || !state.room || !state.chatSender || !state.appPeerId || !state.address) return

    const payload: ChatPayload = {
      id: makeChatId(),
      from: state.appPeerId,
      address: state.address,
      room: state.room,
      text,
      issuedAt: new Date().toISOString()
    }

    await state.chatSender(payload)
    appendChatMessage({ ...payload, self: true })
    setChatDraft('')
  }, [appendChatMessage, chatDraft])

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 block h-screen w-screen" />
      <div className="pointer-events-none fixed inset-0 z-[2] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_30%),radial-gradient(circle_at_18%_18%,rgba(126,255,219,0.12),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(170,202,255,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(4,8,12,0.48)_55%,rgba(3,5,7,0.66))]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[3] h-28 bg-linear-to-b from-white/15 to-transparent opacity-80" />

      <div className="relative z-10 mx-auto w-[min(1380px,calc(100%-24px))] px-2 py-4 md:w-[min(1440px,calc(100%-40px))] md:px-0 md:py-6">
        {!ui.appPeerId ? (
          <section className="grid min-h-[calc(100vh-48px)] place-items-center">
            <div className="w-full max-w-[1120px] rounded-[44px] border border-white/14 bg-white/[0.06] p-3 shadow-[0_24px_120px_rgba(0,0,0,0.28)] backdrop-blur-md">
              <div className="relative overflow-hidden rounded-[36px] border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),inset_0_-1px_0_rgba(255,255,255,0.04),0_20px_60px_rgba(0,0,0,0.28)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_30%,transparent_70%,rgba(255,255,255,0.06))] lg:flex">
                <div className="relative min-w-0 flex-1 p-8 md:p-11">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_30px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                    <span className="h-2 w-2 rounded-full bg-[#98f9d9] shadow-[0_0_16px_rgba(152,249,217,0.9)]" />
                    Private video calls
                  </div>
                  <h1 className="mt-5 max-w-xl text-5xl font-medium tracking-[-0.05em] text-white [font-family:'Orbitron',ui-sans-serif,system-ui,sans-serif] md:text-6xl">
                    Plasmodium
                  </h1>
                  <p className="mt-6 max-w-[620px] text-[18px] leading-8 text-white/72 md:text-[20px]">
                    Meet face to face, drop messages in the side chat, and share a private room link with a softer, modern glass-first feel.
                  </p>
                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[24px] border border-white/14 bg-white/[0.08] p-4 backdrop-blur-xl">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/46">Quick rooms</div>
                      <div className="mt-2 text-sm text-white/84">Create or join with one link.</div>
                    </div>
                    <div className="rounded-[24px] border border-white/14 bg-white/[0.08] p-4 backdrop-blur-xl">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/46">Live chat</div>
                      <div className="mt-2 text-sm text-white/84">Keep messages beside the call.</div>
                    </div>
                    <div className="rounded-[24px] border border-white/14 bg-white/[0.08] p-4 backdrop-blur-xl">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/46">Private identity</div>
                      <div className="mt-2 text-sm text-white/84">Use your wallet or start as a guest.</div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 p-4 lg:w-[min(40%,430px)] lg:min-w-[350px] lg:border-l lg:border-t-0 lg:p-6">
                  <section className="relative mx-auto flex h-full w-full max-w-[420px] flex-col justify-center rounded-[30px] border border-white/16 bg-white/[0.08] p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_20px_80px_rgba(0,0,0,0.18)] backdrop-blur-2xl md:p-8">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/18 bg-white/12 text-xl text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">✦</div>
                    <h2 className="mt-5 text-[40px] font-medium tracking-[-0.05em] text-white">Start your call</h2>
                    <p className="mt-3 text-[15px] leading-6 text-white/62">Sign in with your wallet or jump in with a guest profile to create and share a room.</p>
                    <div className="mt-8 flex flex-col gap-3">
                      <button className="rounded-[22px] border border-white/18 bg-linear-to-b from-white to-[#dffff3] px-5 py-4 text-sm font-semibold text-[#08211d] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_40px_rgba(91,255,200,0.16)] transition duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45" disabled={ui.loginBusy || !hasWallet} onClick={() => void handleWalletLogin()}>
                        {ui.loginBusy && ui.walletMode !== 'Guest' ? 'Checking wallet...' : 'Continue with Ethereum'}
                      </button>
                      <button className="rounded-[22px] border border-white/14 bg-white/10 px-5 py-4 text-sm font-semibold text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_12px_34px_rgba(0,0,0,0.16)] transition duration-200 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-45" disabled={ui.loginBusy} onClick={() => void handleAnonymousLogin()}>
                        {ui.loginBusy && ui.walletMode === 'Guest' ? 'Setting up guest...' : 'Continue as guest'}
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="space-y-4 pb-30">
            <header className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-[32px] border border-white/16 bg-white/[0.08] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-white/60">
                      <PresenceDot active={ui.role === 'broadcaster'} />
                      {ui.role === 'broadcaster' ? 'In the spotlight' : 'Ready to join'}
                    </div>
                    <p className="mt-3 max-w-[640px] text-[15px] leading-6 text-white/66 md:text-[16px]">
                      Share a room link, watch who joins, keep side chat open, and move between camera-on and camera-off naturally.
                    </p>
                  </div>
                  {ui.room ? <div className="inline-flex rounded-full border border-white/16 bg-white/10 px-4 py-3 text-sm text-white/80">Room {ui.room}</div> : null}
                </div>
              </section>

              <section className="rounded-[32px] border border-white/16 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[24px] border border-white/14 bg-white/[0.08] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/44">You</div>
                    <div className="mt-2 text-sm text-white/92">{ui.walletMode ?? 'Disconnected'}</div>
                    <div className="mt-1 break-all text-sm text-white/58">{formatAddress(ui.address)}</div>
                  </div>
                  <div className="rounded-[24px] border border-white/14 bg-white/[0.08] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/44">People</div>
                    <div className="mt-2 text-sm text-white/92">{presenceCount} in room</div>
                    <div className="mt-1 text-sm text-white/58">{broadcasterCount} live · {viewerCount} watching</div>
                  </div>
                  <div className="rounded-[24px] border border-white/14 bg-white/[0.08] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/44">Status</div>
                    <div className="mt-2 text-sm text-white/92">{ui.audioEnabled ? 'Mic on' : 'Mic muted'} · {ui.videoEnabled ? 'Camera on' : 'Camera off'}</div>
                    <div className="mt-1 break-all text-sm text-white/58">{ui.appPeerId ?? '—'}</div>
                  </div>
                </div>
              </section>
            </header>

            <main className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
              <aside className="rounded-[32px] border border-white/16 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                {!ui.room ? (
                  <div className="space-y-4 rounded-[24px] border border-white/14 bg-white/[0.08] p-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">Meet now</div>
                      <h2 className="mt-2 text-[30px] font-medium tracking-[-0.05em] text-white">Start a room</h2>
                      <p className="mt-2 text-sm leading-6 text-white/62">Create a room and share the link like any familiar calling app.</p>
                    </div>
                    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void handleJoinRoom() }}>
                      <input className="w-full rounded-[20px] border border-white/16 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/[0.42]" placeholder="Enter a room name" value={roomDraft} onChange={(event) => setRoomDraft(event.target.value)} />
                      <button className="w-full rounded-[20px] border border-white/18 bg-linear-to-b from-white to-[#dffff3] px-4 py-3 text-sm font-semibold text-[#08211d] disabled:cursor-not-allowed disabled:opacity-45" disabled={!ui.appPeerId || !roomDraft.trim()} type="submit">Join room</button>
                      <button className="w-full rounded-[20px] border border-white/14 bg-white/10 px-4 py-3 text-sm font-semibold text-white/88" type="button" onClick={() => setRoomDraft(makeRoomName())}>Create random room</button>
                    </form>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">People</div>
                        <h3 className="mt-1 text-[26px] font-medium tracking-[-0.05em] text-white">In this call</h3>
                      </div>
                      <div className="rounded-full border border-white/14 bg-white/10 px-3 py-2 text-xs text-white/70">{presenceCount}</div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-[24px] border border-white/14 bg-white/[0.08] p-3">
                        <div className="flex items-center gap-3">
                          <AvatarBadge label={ui.address ?? 'me'} active={ui.role === 'broadcaster'} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-white/92">You</div>
                            <div className="truncate text-xs text-white/56">{formatAddress(ui.address)} · {ui.audioEnabled ? 'mic on' : 'mic off'} · {ui.videoEnabled ? 'camera on' : 'camera off'}</div>
                          </div>
                        </div>
                      </div>
                      {otherPeers.length === 0 ? <div className="rounded-[24px] border border-white/14 bg-white/[0.08] px-4 py-5 text-sm text-white/56">No one else is here yet.</div> : null}
                      {otherPeers.map((peer) => (
                        <div key={peer.from} className="rounded-[24px] border border-white/14 bg-white/[0.08] p-3">
                          <div className="flex items-center gap-3">
                            <AvatarBadge label={peer.address} active={peer.role === 'broadcaster'} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white/92">{formatAddress(peer.address)}</div>
                              <div className="truncate text-xs text-white/56">{peer.role === 'broadcaster' ? 'on camera' : 'listening'} · {peer.audioEnabled ? 'mic on' : 'mic off'} · {peer.videoEnabled ? 'camera on' : 'camera off'}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </aside>

              <section className="rounded-[32px] border border-white/16 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">Call</div>
                    <h2 className="mt-1 text-[30px] font-medium tracking-[-0.05em] text-white">Conversation</h2>
                    <p className="mt-2 max-w-[620px] text-sm leading-6 text-white/62">{callStatus}</p>
                  </div>
                  {ui.room ? <button className="rounded-full border border-white/16 bg-white/10 px-4 py-3 text-sm font-medium text-white/90" onClick={() => void handleCopyLink()}>Copy invite link</button> : null}
                </div>

                {callNotice && ui.room ? <div className="mb-4 rounded-[24px] border border-rose-200/18 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">{callNotice}</div> : null}

                {stageTiles.length > 0 ? (
                  <div className={`grid gap-4 ${stageGridClass}`}>
                    {stageTiles.map((tile) => (
                      <VideoTile key={tile.id} stream={tile.stream} title={tile.title} subtitle={tile.subtitle} muted={tile.muted} badge={tile.badge} />
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-white/14 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),rgba(255,255,255,0.04)_35%,rgba(0,0,0,0.12))] p-8">
                    <div className="text-center">
                      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-white/16 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                        <AvatarBadge label={ui.address ?? 'you'} active={ui.role === 'broadcaster'} large />
                      </div>
                      <div className="text-2xl font-medium text-white/92">You’re ready</div>
                      <div className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/58">Turn on your camera, wait for others to join, or share the room link to get the conversation started.</div>
                    </div>
                  </div>
                )}
              </section>

              <aside className="space-y-4">
                <section className="rounded-[32px] border border-white/16 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">Messages</div>
                  <h3 className="mt-1 text-[26px] font-medium tracking-[-0.05em] text-white">Chat</h3>
                  <div className="mt-4 flex max-h-[420px] min-h-[320px] flex-col-reverse gap-3 overflow-auto rounded-[24px] border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    {ui.chat.length === 0 ? (
                      <div className="text-sm text-white/44">No messages yet.</div>
                    ) : (
                      ui.chat.map((message) => (
                        <div key={message.id} className={`max-w-[88%] rounded-[22px] px-4 py-3 ${message.self ? 'ml-auto bg-[linear-gradient(180deg,rgba(214,255,243,0.95),rgba(164,248,222,0.86))] text-[#0f2b24]' : 'bg-white/[0.08] text-white/86 border border-white/10'}`}>
                          <div className={`text-[11px] ${message.self ? 'text-[#33584d]/70' : 'text-white/46'}`}>{message.self ? 'You' : formatAddress(message.address)} · {new Date(message.issuedAt).toLocaleTimeString()}</div>
                          <div className="pt-1 text-sm leading-6">{message.text}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-4 flex gap-3">
                    <input className="min-w-0 flex-1 rounded-[20px] border border-white/16 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/[0.42]" placeholder="Send a message" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleSendChat() } }} />
                    <button className="rounded-[20px] border border-white/18 bg-linear-to-b from-white to-[#dffff3] px-5 py-3 text-sm font-semibold text-[#08211d]" onClick={() => void handleSendChat()}>Send</button>
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/16 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">Activity</div>
                  <h3 className="mt-1 text-[26px] font-medium tracking-[-0.05em] text-white">Event log</h3>
                  <pre className="mt-4 max-h-[280px] min-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[24px] border border-white/10 bg-black/18 p-4 text-[13px] leading-6 text-white/68">{ui.logs.join('\n')}</pre>
                </section>
              </aside>
            </main>

            {ui.room ? (
              <div className="fixed inset-x-0 bottom-4 z-20 px-3">
                <div className="mx-auto flex w-full max-w-[760px] flex-wrap items-center justify-center gap-3 rounded-[28px] border border-white/18 bg-white/[0.1] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_50px_rgba(0,0,0,0.2)] backdrop-blur-3xl">
                  <button className={`rounded-full px-5 py-3 text-sm font-medium ${ui.audioEnabled ? 'bg-white/10 text-white/92' : 'bg-amber-200/90 text-[#3f2a00]'}`} onClick={() => void handleToggleTrack('audio')}>{ui.audioEnabled ? 'Mute mic' : 'Unmute mic'}</button>
                  <button className={`rounded-full px-5 py-3 text-sm font-medium ${ui.videoEnabled ? 'bg-white/10 text-white/92' : 'bg-sky-200/90 text-[#0a2540]'}`} onClick={() => void handleToggleTrack('video')}>{ui.videoEnabled ? 'Hide camera' : 'Show camera'}</button>
                  <button className={`rounded-full px-5 py-3 text-sm font-medium ${ui.role === 'broadcaster' ? 'bg-emerald-200/90 text-[#143226]' : 'bg-white text-[#102118]'}`} onClick={() => void handleToggleBroadcast()}>{ui.role === 'broadcaster' ? 'Stop sharing camera' : 'Turn on camera'}</button>
                  <button className="rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-white/92" onClick={() => void handleCopyLink()}>Copy link</button>
                  <button className="rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-white/92" onClick={handleSwitchIdentity}>Switch identity</button>
                  <button className="rounded-full bg-[#ff8d8d] px-5 py-3 text-sm font-semibold text-[#431717] shadow-[0_12px_30px_rgba(255,83,83,0.18)]" onClick={handleLeaveRoom}>Leave call</button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
