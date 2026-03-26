import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { joinRoom as joinTrysteroRoom, selfId } from 'trystero'
import { startPhysarumBackground } from './physarum/startPhysarumBackground'

type AppConfig = {
  chainId?: number
  defaultRoom?: string
  trysteroAppId?: string
}

type PeerRecord = {
  from: string
  address: string
  peerId: string
  walletMode: string | null
  kind?: string
}

type PresencePayload = PeerRecord & {
  room: string
  issuedAt: string
}

type RemoteStreamRecord = {
  id: string
  peerId: string
  stream: MediaStream
}

type RealtimeRoom = ReturnType<typeof joinTrysteroRoom>
type PresenceSender = (
  payload: PresencePayload,
  targetPeers?: string | string[] | null
) => Promise<void>

type MutableAppState = {
  config: AppConfig | null
  address: string | null
  walletMode: string | null
  anonymousWallet: ethers.HDNodeWallet | ethers.Wallet | null
  appPeerId: string | null
  room: string | null
  localStream: MediaStream | null
  remoteStreams: Map<string, RemoteStreamRecord>
  peers: Map<string, PeerRecord>
  realtimeRoom: RealtimeRoom | null
  presenceSender: PresenceSender | null
  streamPublishedRoom: string | null
  loginBusy: boolean
  hasPromptedForMedia: boolean
}

type UiState = {
  address: string | null
  walletMode: string | null
  appPeerId: string | null
  room: string | null
  localStream: MediaStream | null
  remoteStreams: RemoteStreamRecord[]
  peers: PeerRecord[]
  loginBusy: boolean
  logs: string[]
}

function VideoTile({
  stream,
  title,
  subtitle,
  muted = false
}: {
  stream: MediaStream
  title: string
  subtitle?: string
  muted?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <figure className="relative m-0 overflow-hidden rounded-[28px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90">
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

function readRoomFromUrl() {
  return new URLSearchParams(window.location.search).get('room') || null
}

async function fetchJson<T>(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {})
    }
  })

  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`)
  return body as T
}

function makeRoomName() {
  return `room-${crypto.randomUUID().slice(0, 8)}`
}

function formatAddress(address: string | null) {
  if (!address) return 'Disconnected'
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [roomDraft, setRoomDraft] = useState(() => readRoomFromUrl() ?? '')
  const [callNotice, setCallNotice] = useState<string | null>(null)

  const stateRef = useRef<MutableAppState>({
    config: null,
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
    streamPublishedRoom: null,
    loginBusy: false,
    hasPromptedForMedia: false
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
    logs: []
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
      loginBusy: state.loginBusy
    }))
  }, [])

  const log = useCallback((message: string, payload?: unknown) => {
    const line = `[${new Date().toLocaleTimeString()}] ${message}${payload === undefined ? '' : ` ${JSON.stringify(payload)}`}`
    setUi((current) => ({ ...current, logs: [line, ...current.logs] }))
  }, [])

  const clearRemoteState = useCallback(() => {
    const state = stateRef.current
    state.remoteStreams.clear()
    syncUi()
  }, [syncUi])

  const makePresencePayload = useCallback((): PresencePayload | null => {
    const state = stateRef.current
    if (!state.appPeerId || !state.address || !state.room) return null
    return {
      kind: 'announce',
      room: state.room,
      from: state.appPeerId,
      address: state.address,
      walletMode: state.walletMode,
      peerId: selfId,
      issuedAt: new Date().toISOString()
    }
  }, [])

  const publishPresence = useCallback(
    async (targetPeers?: string | string[] | null) => {
      const state = stateRef.current
      const payload = makePresencePayload()
      if (!payload || !state.presenceSender) return
      await state.presenceSender(payload, targetPeers)
    },
    [makePresencePayload]
  )

  const publishLocalStream = useCallback(
    async (targetPeers?: string | string[] | null) => {
      const state = stateRef.current
      if (!state.realtimeRoom || !state.localStream || !state.room) return

      if (targetPeers) {
        state.realtimeRoom.addStream(state.localStream, targetPeers)
        return
      }

      if (state.streamPublishedRoom === state.room) return
      state.realtimeRoom.addStream(state.localStream)
      state.streamPublishedRoom = state.room
    },
    []
  )

  const ensureMedia = useCallback(async () => {
    const state = stateRef.current
    if (state.localStream) return state.localStream

    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    syncUi()
    log('Camera and microphone ready')

    if (state.room && state.realtimeRoom) {
      await publishLocalStream()
    }

    return state.localStream
  }, [log, publishLocalStream, syncUi])

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

  const closeRealtimeRoom = useCallback(
    (options?: { clearRoom?: boolean; logLeave?: boolean; notice?: string | null }) => {
      const state = stateRef.current
      const roomName = state.room
      const payload = makePresencePayload()

      if (payload?.from && payload.address && state.presenceSender) {
        void state.presenceSender({ ...payload, kind: 'leave' }).catch(() => {})
      }

      if (state.realtimeRoom) {
        state.realtimeRoom.leave()
      }

      state.realtimeRoom = null
      state.presenceSender = null
      state.peers.clear()
      state.streamPublishedRoom = null
      state.hasPromptedForMedia = false
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
    },
    [clearRemoteState, log, makePresencePayload, syncUi]
  )

  const joinRoom = useCallback(
    async (roomName?: string | null) => {
      const room = (roomName || stateRef.current.room || makeRoomName()).trim()
      if (!room) return

      const state = stateRef.current
      if (!state.appPeerId || !state.address) {
        log('Sign in before joining a room')
        return
      }

      const config = state.config
      if (!config?.trysteroAppId) {
        log('Realtime config is not ready yet')
        return
      }

      if (state.realtimeRoom) {
        closeRealtimeRoom()
      }

      const realtimeRoom = joinTrysteroRoom({ appId: config.trysteroAppId }, room)
      const [sendPresence, getPresence] = realtimeRoom.makeAction<PresencePayload>('presence')

      realtimeRoom.onPeerJoin((peerId) => {
        const currentState = stateRef.current
        if (currentState.localStream) {
          realtimeRoom.addStream(currentState.localStream, peerId)
        }
        void publishPresence(peerId)
      })

      realtimeRoom.onPeerLeave((peerId) => {
        const currentState = stateRef.current

        for (const [appPeerId, peer] of currentState.peers.entries()) {
          if (peer.peerId === peerId) {
            currentState.peers.delete(appPeerId)
            log('Someone left the room', { address: peer.address, peerId: appPeerId })
          }
        }

        for (const [streamId, record] of currentState.remoteStreams.entries()) {
          if (record.peerId === peerId) {
            currentState.remoteStreams.delete(streamId)
          }
        }

        syncUi()
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

      getPresence((payload, peerId) => {
        const currentState = stateRef.current
        if (!payload?.from || payload.from === currentState.appPeerId) return

        const knownPeer = currentState.peers.has(payload.from)

        if (payload.kind === 'leave') {
          currentState.peers.delete(payload.from)
          log('Someone left the room', { address: payload.address, peerId: payload.from })
        } else {
          currentState.peers.set(payload.from, {
            from: payload.from,
            address: payload.address,
            peerId,
            walletMode: payload.walletMode,
            kind: payload.kind
          })
          if (!knownPeer) {
            log('Someone joined the room', { address: payload.address, peerId: payload.from })
          }
        }

        syncUi()
      })

      setCallNotice(null)
      state.room = room
      state.realtimeRoom = realtimeRoom
      state.presenceSender = async (payload, targetPeers) => {
        await sendPresence(payload, targetPeers)
      }
      state.peers.clear()
      state.streamPublishedRoom = null
      clearRemoteState()
      window.history.replaceState({}, '', `${window.location.pathname}?room=${encodeURIComponent(room)}`)
      syncUi()
      setRoomDraft(room)
      log('Joined room', { room })
      await publishPresence()
      await maybePromptMedia()
    },
    [clearRemoteState, closeRealtimeRoom, log, maybePromptMedia, publishPresence, syncUi]
  )

  const proveWalletOwnership = useCallback(
    async (address: string, signer: (message: string) => Promise<string>, walletMode: string) => {
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

      if (stateRef.current.room && stateRef.current.config?.trysteroAppId) {
        await joinRoom(stateRef.current.room)
      }
    },
    [joinRoom, log, syncUi]
  )

  const resetAuthSession = useCallback(() => {
    stateRef.current.appPeerId = null
    stateRef.current.room = readRoomFromUrl()
    stateRef.current.peers.clear()
    stateRef.current.hasPromptedForMedia = false
    stateRef.current.realtimeRoom = null
    stateRef.current.presenceSender = null
    stateRef.current.streamPublishedRoom = null
    clearRemoteState()
    syncUi()
  }, [clearRemoteState, syncUi])

  const setLoginBusy = useCallback(
    (busy: boolean) => {
      stateRef.current.loginBusy = busy
      syncUi()
    },
    [syncUi]
  )

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
    let disposed = false

    void (async () => {
      try {
        stateRef.current.config = await fetchJson('/api/config')
      } catch (error) {
        if (!disposed) {
          log(`Config load failed: ${(error as Error).message}`)
        }
      }

      if (disposed) return

      setLoginBusy(false)
      syncUi()
      log('App ready')

      if (stateRef.current.appPeerId && stateRef.current.room && !stateRef.current.realtimeRoom) {
        await joinRoom(stateRef.current.room)
      }
    })()

    return () => {
      disposed = true

      const state = stateRef.current
      const payload = makePresencePayload()
      if (payload && state.presenceSender) {
        void state.presenceSender({ ...payload, kind: 'leave' }).catch(() => {})
      }

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
  }, [clearRemoteState, joinRoom, log, makePresencePayload, setLoginBusy, syncUi])

  const otherPeers = useMemo(() => ui.peers.filter((peer) => peer.from !== ui.appPeerId), [ui.appPeerId, ui.peers])
  const remoteStreams = useMemo(() => ui.remoteStreams, [ui.remoteStreams])
  const hasWallet = typeof window !== 'undefined' && Boolean(window.ethereum)

  const presenceCount = otherPeers.length + (ui.room ? 1 : 0)

  const callStatus = useMemo(() => {
    if (!ui.room) return 'Join a room to start your call.'
    if (callNotice) return callNotice
    if (!ui.localStream) return 'Requesting camera and microphone access...'
    if (otherPeers.length === 0) return 'Waiting for someone else to join the room.'
    if (remoteStreams.length > 0) {
      return `Connected to ${remoteStreams.length} remote ${remoteStreams.length === 1 ? 'stream' : 'streams'}.`
    }
    return `Connecting to ${otherPeers.length} ${otherPeers.length === 1 ? 'participant' : 'participants'}...`
  }, [callNotice, otherPeers.length, remoteStreams.length, ui.localStream, ui.room])

  const peerLookupByPeerId = useMemo(
    () => new Map(otherPeers.map((peer) => [peer.peerId, peer])),
    [otherPeers]
  )

  const remoteTiles = useMemo(
    () =>
      remoteStreams.map((record) => ({
        ...record,
        peer: peerLookupByPeerId.get(record.peerId) ?? null
      })),
    [peerLookupByPeerId, remoteStreams]
  )

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

      const [address] = (await window.ethereum.request({
        method: 'eth_requestAccounts'
      })) as string[]

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

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 block h-screen w-screen" />
      <div className="pointer-events-none fixed inset-0 z-[2] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_30%),radial-gradient(circle_at_20%_18%,rgba(126,255,219,0.09),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(140,184,255,0.12),transparent_22%),linear-gradient(180deg,rgba(7,13,20,0.1),rgba(3,6,8,0.58)_55%,rgba(2,3,6,0.72))]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[3] h-28 bg-linear-to-b from-white/12 to-transparent opacity-70" />

      <div className="relative z-10 mx-auto w-[min(1220px,calc(100%-24px))] px-2 py-4 md:w-[min(1320px,calc(100%-40px))] md:px-0 md:py-6">
        {!ui.appPeerId ? (
          <section className="grid min-h-[calc(100vh-48px)] place-items-center">
            <div className="w-full max-w-[1080px] space-y-3 rounded-[42px] border border-white/10 bg-white/[0.045] p-3 shadow-[0_24px_120px_rgba(0,0,0,0.35)] backdrop-blur-sm">
              <div className="relative overflow-hidden rounded-[34px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 lg:flex">
                <div className="relative min-w-0 flex-1 p-7 md:p-10">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                    <span className="h-2 w-2 rounded-full bg-[#98f9d9] shadow-[0_0_16px_rgba(152,249,217,0.9)]" />
                    Private video room
                  </div>
                  <h1 className="mt-4 w-full max-w-full font-medium uppercase leading-[0.88] tracking-[-0.04em] text-white [font-family:'Orbitron',ui-sans-serif,system-ui,sans-serif] [text-shadow:0_0_32px_rgba(153,210,255,0.28),0_0_12px_rgba(147,247,212,0.18)] text-[clamp(36px,9.5vw,64px)] md:max-w-[10ch] md:text-[clamp(52px,5.5vw,96px)] xl:text-[clamp(64px,6vw,112px)]">
                    Plasmodium
                  </h1>
                  <p className="mt-6 max-w-[560px] text-[17px] leading-7 text-white/68 md:text-[19px]">
                    Peer-to-peer video with verifiable d identity, so you know who owns the address on the other end in a direct call with no room host or audience in the middle.
                  </p>

                </div>

                <div className="border-t border-white/10 p-4 lg:w-[min(42%,420px)] lg:min-w-[340px] lg:flex-none lg:border-t-0 lg:border-l lg:p-5">
                  <section className="relative mx-auto flex h-full w-full max-w-[420px] flex-col justify-center rounded-[28px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] bg-white/[0.06] p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_80px_rgba(0,0,0,0.25),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:p-7">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/16 bg-white/10 text-lg text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                      ✦
                    </div>
                    <h2 className="mt-5 text-[38px] font-medium tracking-[-0.04em] text-white">Verify identity</h2>
                    <p className="mt-3 text-[15px] leading-6 text-white/62">Create a private guest wallet or prove you control your Ethereum wallet.</p>

                    <div className="mt-7 flex flex-col gap-3">
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/18 bg-linear-to-b from-[#edfffb]/90 via-[#cfffe8]/78 to-[#8af6cf]/74 px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-[#08211d] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_18px_40px_rgba(91,255,200,0.18)] transition duration-200 hover:scale-[1.01] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        disabled={ui.loginBusy || !hasWallet}
                        onClick={() => void handleWalletLogin()}
                      >
                        <span className="relative z-10">
                          {ui.loginBusy && ui.walletMode !== 'Guest' ? 'Verifying wallet...' : 'Verify Ethereum wallet'}
                        </span>
                      </button>
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] transition duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        disabled={ui.loginBusy}
                        onClick={() => void handleAnonymousLogin()}
                      >
                        <span className="relative z-10">
                          {ui.loginBusy && ui.walletMode === 'Guest' ? 'Creating guest wallet...' : 'Continue as guest'}
                        </span>
                      </button>
                    </div>
                  </section>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Identity</div>
                  <div className="mt-2 text-base text-white/88">Verified wallet or private guest</div>
                </div>
                <div className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Privacy</div>
                  <div className="mt-2 text-base text-white/88">Peer-to-peer, powered by Trystero</div>
                </div>
                <div className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Trust</div>
                  <div className="mt-2 text-base text-white/88">Prove the address behind the voice</div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            <header className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] xl:items-stretch">
              <section className="relative rounded-[30px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:px-6 md:py-5">
                <div className="flex h-full flex-col justify-center gap-3 md:flex-row md:items-center md:justify-between md:gap-5">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-white/56 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                      <span className="h-2 w-2 rounded-full bg-[#95d6ff] shadow-[0_0_18px_rgba(149,214,255,0.9)]" />
                      Private by default
                    </div>
                    <p className="mt-3 max-w-[640px] text-[15px] leading-6 text-white/62 md:text-[16px]">
                      Share a room link for a direct peer-to-peer call, with optional Ethereum address verification.
                    </p>
                  </div>
                  {ui.room && (
                    <div className="inline-flex w-fit shrink-0 rounded-full border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-4 py-3 text-sm text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                      Room {ui.room}
                    </div>
                  )}
                </div>
              </section>

              <section className="relative rounded-[30px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:p-4">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-[22px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Identity</div>
                    <div className="mt-1.5 text-sm text-white/92">{ui.walletMode ?? 'Disconnected'}</div>
                    <div className="mt-1 break-all text-sm text-white/58">{formatAddress(ui.address)}</div>
                  </div>
                  <div className="rounded-[22px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Peer ID</div>
                    <div className="mt-1.5 break-all text-sm text-white/72">{ui.appPeerId ?? '—'}</div>
                  </div>
                </div>
              </section>
            </header>

            <main className="grid grid-cols-12 gap-5">
              {!ui.room && (
                <section className="relative col-span-12 rounded-[34px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:p-7">
                  <div className="flex flex-col gap-5">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Room</div>
                      <h2 className="mt-3 text-[34px] font-medium tracking-[-0.05em] text-white">Join or create a room</h2>
                      <p className="mt-3 max-w-[620px] text-white/60">
                        When you join, the app will ask for camera and microphone access and start setting up your call.
                      </p>
                    </div>
                    <form
                      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void handleJoinRoom()
                      }}
                    >
                      <input
                        className="min-w-0 rounded-[22px] border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.07))] px-4 py-3.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.04),0_12px_36px_rgba(0,0,0,0.18)] outline-none [backdrop-filter:blur(18px)_saturate(145%)] [-webkit-backdrop-filter:blur(18px)_saturate(145%)] placeholder:text-white/[0.42] focus:border-[rgba(147,247,212,0.45)] focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_0_0_1px_rgba(147,247,212,0.22),0_12px_36px_rgba(0,0,0,0.22)]"
                        placeholder="Enter a room name"
                        value={roomDraft}
                        onChange={(event) => setRoomDraft(event.target.value)}
                      />
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/18 bg-linear-to-b from-[#edfffb]/90 via-[#cfffe8]/78 to-[#8af6cf]/74 px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-[#08211d] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_18px_40px_rgba(91,255,200,0.18)] transition duration-200 hover:scale-[1.01] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        disabled={!ui.appPeerId || !roomDraft.trim()}
                        type="submit"
                      >
                        <span className="relative z-10">Join room</span>
                      </button>
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] transition duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        type="button"
                        onClick={() => setRoomDraft(makeRoomName())}
                      >
                        <span className="relative z-10">Random room</span>
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] transition duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        onClick={handleSwitchIdentity}
                      >
                        <span className="relative z-10">Log out</span>
                      </button>
                    </div>
                  </div>
                </section>
              )}

              <section className="relative col-span-12 rounded-[34px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:p-5">
                <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Call</div>
                    <h2 className="mt-2 text-[34px] font-medium tracking-[-0.05em] text-white">Video call</h2>
                    <p className="mt-2 max-w-[560px] text-white/60">{callStatus}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {ui.room && (
                      <div className="inline-flex rounded-full border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-4 py-3 text-sm text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                        Room {ui.room}
                      </div>
                    )}
                    <div className="inline-flex rounded-full border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-4 py-3 text-sm text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                      {presenceCount} {presenceCount === 1 ? 'person' : 'people'} here
                    </div>
                  </div>
                </div>

                {callNotice && ui.room && (
                  <div className="mb-5 rounded-[24px] border border-rose-200/18 bg-rose-300/10 px-4 py-3 text-sm text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    {callNotice}
                  </div>
                )}

                {(ui.localStream || remoteStreams.length > 0) && (
                  <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {ui.localStream ? (
                      <VideoTile
                        stream={ui.localStream}
                        title="You"
                        subtitle={ui.address ? formatAddress(ui.address) : ui.walletMode ?? undefined}
                        muted
                      />
                    ) : null}

                    {remoteTiles.length > 0 ? (
                      remoteTiles.map((record) => (
                        <VideoTile
                          key={record.id}
                          stream={record.stream}
                          title={record.peer?.address ?? 'Connecting participant'}
                          subtitle={record.peer?.walletMode ?? record.peer?.from ?? record.peerId}
                        />
                      ))
                    ) : (
                      <div className="relative grid min-h-[260px] place-items-center rounded-[30px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] bg-black/12 p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:col-span-2 xl:col-span-2">
                        <div>
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/14 bg-white/10 text-2xl">
                            ◎
                          </div>
                          <p className="mt-5 text-lg text-white/78">Waiting for participants to publish media</p>
                          <p className="mt-2 text-sm text-white/48">Each person who joins the room will appear as their own tile.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {ui.room && (
                    <>
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/18 bg-linear-to-b from-[#edfffb]/90 via-[#cfffe8]/78 to-[#8af6cf]/74 px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-[#08211d] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_18px_40px_rgba(91,255,200,0.18)] transition duration-200 hover:scale-[1.01] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        onClick={() => void handleCopyLink()}
                      >
                        <span className="relative z-10">Copy invite link</span>
                      </button>
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] transition duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        onClick={handleLeaveRoom}
                      >
                        <span className="relative z-10">Leave room</span>
                      </button>
                      <button
                        className="relative overflow-hidden rounded-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-5 py-3.5 text-sm font-semibold tracking-[0.01em] text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] transition duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-['']"
                        onClick={handleSwitchIdentity}
                      >
                        <span className="relative z-10">Switch identity</span>
                      </button>
                    </>
                  )}
                </div>
              </section>

              <div className="col-span-12 grid gap-5">
                <section className="relative rounded-[34px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Presence</div>
                      <h3 className="mt-2 text-[28px] font-medium tracking-[-0.05em] text-white">People here</h3>
                    </div>
                    <div className="rounded-full border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-3 py-2 text-xs text-white/64 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                      {otherPeers.length} remote
                    </div>
                  </div>
                  {otherPeers.length === 0 ? (
                    <div className="mt-5 rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-4 py-4 text-white/56 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]">
                      No one else is here yet.
                    </div>
                  ) : (
                    <ul className="mt-5 grid list-none gap-3 p-0">
                      {otherPeers.map((peer) => (
                        <li
                          key={peer.from}
                          className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_40px_rgba(0,0,0,0.2)] [backdrop-filter:blur(20px)_saturate(150%)] [-webkit-backdrop-filter:blur(20px)_saturate(150%)]"
                        >
                          <strong className="block break-all text-white/92">{peer.address}</strong>
                          <small className="mt-2 block break-all text-white/48">{peer.from}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="relative rounded-[34px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.32),0_2px_12px_rgba(129,181,255,0.08)] [backdrop-filter:blur(28px)_saturate(150%)] [-webkit-backdrop-filter:blur(28px)_saturate(150%)] after:pointer-events-none after:absolute after:inset-0 after:[border-radius:inherit] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_28%,transparent_72%,rgba(255,255,255,0.05))] after:opacity-90 md:p-6">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Activity</div>
                  <h3 className="mt-2 text-[28px] font-medium tracking-[-0.05em] text-white">Activity log</h3>
                  <pre className="mt-5 max-h-[420px] min-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-[24px] border border-white/10 bg-black/18 p-4 text-[13px] leading-6 text-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    {ui.logs.join('\n')}
                  </pre>
                </section>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
