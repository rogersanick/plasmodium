import { type ButtonHTMLAttributes, type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { startPhysarumBackground } from '@physarum/client/browser/physarum-background'

type PeerRecord = {
  from: string
  address: string
  kind?: string
}

type SignalPayload = {
  kind: 'description' | 'ice'
  from?: string
  to?: string
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

type MutableAppState = {
  config: unknown
  address: string | null
  walletMode: string | null
  anonymousWallet: ethers.HDNodeWallet | ethers.Wallet | null
  sessionId: string | null
  appPeerId: string | null
  socket: WebSocket | null
  socketReadyPromise: Promise<WebSocket> | null
  room: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  pc: RTCPeerConnection | null
  peers: Map<string, PeerRecord>
  announcedPeers: Set<string>
  makingOffer: boolean
  ignoreOffer: boolean
  polite: boolean
  loginBusy: boolean
  hasPromptedForMedia: boolean
  pendingRemoteCandidates: RTCIceCandidateInit[]
}

type UiState = {
  address: string | null
  walletMode: string | null
  sessionId: string | null
  appPeerId: string | null
  room: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  peers: PeerRecord[]
  loginBusy: boolean
  walletHint: string
  logs: string[]
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

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function Panel({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn(
        'rounded-[24px] border border-emerald-200/10 bg-[rgba(6,15,12,0.72)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-[18px]',
        className
      )}
    >
      {children}
    </section>
  )
}

function ActionButton({
  children,
  className,
  variant = 'primary',
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }>) {
  return (
    <button
      className={cn(
        'rounded-[14px] border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary'
          ? 'border-emerald-200/20 bg-linear-to-br from-[#75ffbb] to-[#c0ffd8] text-[#052319] hover:brightness-105'
          : 'border-emerald-200/20 bg-emerald-300/8 text-emerald-50 hover:bg-emerald-300/12',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)

  const stateRef = useRef<MutableAppState>({
    config: null,
    address: null,
    walletMode: null,
    anonymousWallet: null,
    sessionId: null,
    appPeerId: null,
    socket: null,
    socketReadyPromise: null,
    room: readRoomFromUrl(),
    localStream: null,
    remoteStream: null,
    pc: null,
    peers: new Map(),
    announcedPeers: new Set(),
    makingOffer: false,
    ignoreOffer: false,
    polite: false,
    loginBusy: false,
    hasPromptedForMedia: false,
    pendingRemoteCandidates: []
  })

  const [ui, setUi] = useState<UiState>({
    address: null,
    walletMode: null,
    sessionId: null,
    appPeerId: null,
    room: readRoomFromUrl(),
    localStream: null,
    remoteStream: null,
    peers: [],
    loginBusy: false,
    walletHint: 'Checking for Ethereum wallet...',
    logs: []
  })

  const setWalletHint = useCallback((walletHint: string) => {
    setUi((current) => ({ ...current, walletHint }))
  }, [])

  const syncUi = useCallback(() => {
    const state = stateRef.current
    setUi((current) => ({
      ...current,
      address: state.address,
      walletMode: state.walletMode,
      sessionId: state.sessionId,
      appPeerId: state.appPeerId,
      room: state.room,
      localStream: state.localStream,
      remoteStream: state.remoteStream,
      peers: [...state.peers.values()],
      loginBusy: state.loginBusy
    }))
  }, [])

  const log = useCallback((message: string, payload?: unknown) => {
    const line = `[${new Date().toLocaleTimeString()}] ${message}${payload === undefined ? '' : ` ${JSON.stringify(payload)}`}`
    setUi((current) => ({ ...current, logs: [line, ...current.logs] }))
  }, [])

  const targetPeerId = useCallback(() => {
    const state = stateRef.current
    const peers = [...state.peers.values()].filter((peer) => peer.from !== state.appPeerId)
    return peers[0]?.from ?? null
  }, [])

  const closePeerConnection = useCallback(() => {
    const state = stateRef.current
    if (state.pc) {
      state.pc.ontrack = null
      state.pc.onicecandidate = null
      state.pc.onnegotiationneeded = null
      state.pc.onconnectionstatechange = null
      state.pc.close()
    }

    state.pc = null
    state.remoteStream = null
    state.pendingRemoteCandidates = []
    syncUi()
  }, [syncUi])

  const sendSignal = useCallback(async (payload: SignalPayload) => {
    const socket = stateRef.current.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    socket.send(JSON.stringify({ type: 'signal-send', payload }))
  }, [])

  const startPeerConnection = useCallback(async () => {
    const state = stateRef.current
    const remotePeerId = targetPeerId()
    if (!remotePeerId || !state.localStream) {
      syncUi()
      return
    }

    state.polite = (state.appPeerId ?? '') > remotePeerId
    state.remoteStream = new MediaStream()
    state.pc = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
    })

    for (const track of state.localStream.getTracks()) {
      state.pc.addTrack(track, state.localStream)
    }

    state.pc.ontrack = ({ streams }) => {
      const remoteStream = stateRef.current.remoteStream
      if (!remoteStream || !streams[0]) return

      for (const track of streams[0].getTracks()) {
        remoteStream.addTrack(track)
      }

      syncUi()
    }

    state.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        void sendSignal({ kind: 'ice', to: remotePeerId, candidate })
      }
    }

    state.pc.onnegotiationneeded = async () => {
      const currentState = stateRef.current
      if (!currentState.pc) return

      try {
        currentState.makingOffer = true
        await currentState.pc.setLocalDescription()
        await sendSignal({
          kind: 'description',
          to: remotePeerId,
          description: currentState.pc.localDescription ?? undefined
        })
        log('Starting call setup', { type: currentState.pc.localDescription?.type })
      } catch (error) {
        log(`Call setup failed: ${(error as Error).message}`)
      } finally {
        currentState.makingOffer = false
      }
    }

    state.pc.onconnectionstatechange = () => {
      const currentState = stateRef.current
      log('Call state changed', { state: currentState.pc?.connectionState })
      syncUi()
    }

    syncUi()
  }, [log, sendSignal, syncUi, targetPeerId])

  const handleSignal = useCallback(
    async (payload?: SignalPayload) => {
      const state = stateRef.current
      if (!payload || payload.from === state.appPeerId) return
      if (payload.to && payload.to !== state.appPeerId) return
      if (!state.localStream) return

      if (!state.pc) {
        await startPeerConnection()
      }

      const pc = stateRef.current.pc
      if (!pc) return

      if (payload.kind === 'description' && payload.description) {
        const offerCollision =
          payload.description.type === 'offer' &&
          (stateRef.current.makingOffer || pc.signalingState !== 'stable')

        stateRef.current.ignoreOffer = !stateRef.current.polite && offerCollision
        if (stateRef.current.ignoreOffer) return

        await pc.setRemoteDescription(payload.description)

        const pendingCandidates = [...stateRef.current.pendingRemoteCandidates]
        stateRef.current.pendingRemoteCandidates = []
        for (const candidate of pendingCandidates) {
          await pc.addIceCandidate(candidate)
        }

        if (payload.description.type === 'offer') {
          await pc.setLocalDescription()
          await sendSignal({
            kind: 'description',
            to: payload.from,
            description: pc.localDescription ?? undefined
          })
          log('Accepted incoming call setup', { from: payload.from })
        }
        return
      }

      if (payload.kind === 'ice' && payload.candidate) {
        if (!pc.remoteDescription) {
          stateRef.current.pendingRemoteCandidates.push(payload.candidate)
          return
        }

        try {
          await pc.addIceCandidate(payload.candidate)
        } catch (error) {
          if (!stateRef.current.ignoreOffer) {
            log(`Network candidate failed: ${(error as Error).message}`)
          }
        }
      }
    },
    [log, sendSignal, startPeerConnection]
  )

  const ensureMedia = useCallback(async () => {
    const state = stateRef.current
    if (state.localStream) return state.localStream

    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    syncUi()
    log('Camera and microphone are on')

    if (targetPeerId() && !state.pc) {
      await startPeerConnection()
    }

    return state.localStream
  }, [log, startPeerConnection, syncUi, targetPeerId])

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

  const ensureSocket = useCallback(async () => {
    const state = stateRef.current
    if (state.socket?.readyState === WebSocket.OPEN) return state.socket
    if (state.socketReadyPromise) {
      await state.socketReadyPromise
      return stateRef.current.socket as WebSocket
    }

    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`)
    state.socket = socket

    socket.addEventListener('message', async (event) => {
      const message = JSON.parse(event.data)

      if (message.type === 'session-bound') {
        log('Logged in', message.session)
        return
      }

      if (message.type === 'joined-room') {
        stateRef.current.room = message.room
        window.history.replaceState({}, '', `${window.location.pathname}?room=${encodeURIComponent(message.room)}`)
        syncUi()
        log('Joined room', { room: message.room })
        socket.send(JSON.stringify({ type: 'presence-ping' }))
        await maybePromptMedia()
        return
      }

      if (message.type === 'left-room') {
        stateRef.current.room = null
        stateRef.current.peers.clear()
        stateRef.current.hasPromptedForMedia = false
        closePeerConnection()
        window.history.replaceState({}, '', window.location.pathname)
        syncUi()
        log('Left room')
        return
      }

      if (message.type === 'presence') {
        const payload = message.payload as PeerRecord | undefined
        if (!payload?.from) return

        const currentState = stateRef.current
        const knownPeer = currentState.peers.has(payload.from)

        if (payload.kind === 'leave') {
          currentState.peers.delete(payload.from)
          currentState.announcedPeers.delete(payload.from)
          if (payload.from !== currentState.appPeerId) {
            log('Peer left room', { address: payload.address, peerId: payload.from })
          }
        } else {
          currentState.peers.set(payload.from, payload)
          if (payload.from !== currentState.appPeerId && !knownPeer) {
            log('Peer joined room', { address: payload.address, peerId: payload.from })
            if (!currentState.announcedPeers.has(payload.from) && currentState.socket?.readyState === WebSocket.OPEN) {
              currentState.announcedPeers.add(payload.from)
              currentState.socket.send(JSON.stringify({ type: 'presence-ping' }))
            }
          }
        }

        syncUi()
        if (currentState.localStream && targetPeerId() && !currentState.pc) {
          await startPeerConnection()
        }
        return
      }

      if (message.type === 'signal') {
        await handleSignal(message.payload as SignalPayload | undefined)
        return
      }

      if (message.type === 'error') {
        log(`Error: ${message.error}`)
      }
    })

    state.socketReadyPromise = new Promise<WebSocket>((resolve, reject) => {
      const handleOpen = () => {
        socket.send(JSON.stringify({ type: 'bind-session', sessionId: stateRef.current.sessionId }))
        stateRef.current.socketReadyPromise = null
        resolve(socket)
      }

      const handleError = (event: Event) => {
        stateRef.current.socketReadyPromise = null
        reject((event as ErrorEvent).error ?? new Error('WebSocket connection failed'))
      }

      socket.addEventListener('open', handleOpen, { once: true })
      socket.addEventListener('error', handleError, { once: true })
    })

    await state.socketReadyPromise
    return socket
  }, [closePeerConnection, handleSignal, log, maybePromptMedia, startPeerConnection, syncUi, targetPeerId])

  const joinRoom = useCallback(
    async (roomName?: string | null) => {
      const socket = await ensureSocket()
      const room = (roomName || stateRef.current.room || makeRoomName()).trim()

      stateRef.current.room = room
      window.history.replaceState({}, '', `${window.location.pathname}?room=${encodeURIComponent(room)}`)
      syncUi()
      socket.send(JSON.stringify({ type: 'join-room', room }))
    },
    [ensureSocket, syncUi]
  )

  const authenticate = useCallback(
    async (address: string, signer: (message: string) => Promise<string>) => {
      const challenge = await fetchJson<{ message: string; nonce: string }>('/api/auth/request', {
        method: 'POST',
        body: JSON.stringify({ address, chainId: 1 })
      })

      const signature = await signer(challenge.message)
      const verified = await fetchJson<{ sessionId: string; appPeerId: string; address: string }>('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ nonce: challenge.nonce, signature })
      })

      stateRef.current.sessionId = verified.sessionId
      stateRef.current.appPeerId = verified.appPeerId
      syncUi()
      log('Login complete', { address: verified.address, walletMode: stateRef.current.walletMode })

      try {
        await ensureSocket()
      } catch (error) {
        log(`Realtime connection failed: ${(error as Error).message}`)
      }

      if (stateRef.current.room) {
        await joinRoom(stateRef.current.room)
      }
    },
    [ensureSocket, joinRoom, log, syncUi]
  )

  const resetAuthSession = useCallback(() => {
    stateRef.current.sessionId = null
    stateRef.current.appPeerId = null
    stateRef.current.room = readRoomFromUrl()
    stateRef.current.peers.clear()
    stateRef.current.announcedPeers.clear()
    stateRef.current.hasPromptedForMedia = false
    closePeerConnection()
    syncUi()
  }, [closePeerConnection, syncUi])

  const setLoginBusy = useCallback(
    (busy: boolean) => {
      stateRef.current.loginBusy = busy
      syncUi()
    },
    [syncUi]
  )

  useEffect(() => {
    const localVideo = localVideoRef.current
    if (localVideo) {
      localVideo.srcObject = ui.localStream
    }
  }, [ui.localStream])

  useEffect(() => {
    const remoteVideo = remoteVideoRef.current
    if (remoteVideo) {
      remoteVideo.srcObject = ui.remoteStream
    }
  }, [ui.remoteStream])

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

      setWalletHint(
        window.ethereum
          ? 'Ethereum wallet detected. Or continue anonymously.'
          : 'No Ethereum wallet detected. Continue anonymously to enter.'
      )
      setLoginBusy(false)
      syncUi()
      log('Plasmodium loaded')
    })()

    return () => {
      disposed = true

      const state = stateRef.current
      if (state.socket && state.socket.readyState < WebSocket.CLOSING) {
        state.socket.close()
      }

      closePeerConnection()

      if (state.localStream) {
        for (const track of state.localStream.getTracks()) {
          track.stop()
        }
      }
    }
  }, [closePeerConnection, log, setLoginBusy, setWalletHint, syncUi])

  const otherPeers = useMemo(
    () => ui.peers.filter((peer) => peer.from !== ui.appPeerId),
    [ui.appPeerId, ui.peers]
  )

  const presenceCount = otherPeers.length + (ui.room ? 1 : 0)

  const callStatus = useMemo(() => {
    if (!ui.room) return 'Join a room to start your call.'
    if (!ui.localStream) return 'Requesting camera and microphone access...'
    if (otherPeers.length === 0) return 'Waiting for someone else to join the room.'
    if (ui.remoteStream) return 'Call connected.'
    return 'Connecting call...'
  }, [otherPeers.length, ui.localStream, ui.remoteStream, ui.room])

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
        setWalletHint('No Ethereum wallet found. You can still continue anonymously.')
        return
      }

      setLoginBusy(true)
      resetAuthSession()
      stateRef.current.anonymousWallet = null

      const [address] = (await window.ethereum.request({
        method: 'eth_requestAccounts'
      })) as string[]

      stateRef.current.address = address
      stateRef.current.walletMode = 'Ethereum wallet'
      syncUi()

      await authenticate(address, async (message) => {
        return (await window.ethereum?.request({
          method: 'personal_sign',
          params: [message, address]
        })) as string
      })
    } catch (error) {
      log(`Login failed: ${(error as Error).message}`)
      setWalletHint(`Login failed: ${(error as Error).message}`)
    } finally {
      setLoginBusy(false)
    }
  }, [authenticate, log, resetAuthSession, setLoginBusy, setWalletHint, syncUi])

  const handleAnonymousLogin = useCallback(async () => {
    try {
      setLoginBusy(true)
      resetAuthSession()

      const anonymousWallet = ethers.Wallet.createRandom()
      stateRef.current.anonymousWallet = anonymousWallet
      stateRef.current.address = anonymousWallet.address
      stateRef.current.walletMode = 'Anonymous'
      syncUi()

      await authenticate(anonymousWallet.address, (message) => anonymousWallet.signMessage(message))
    } catch (error) {
      log(`Anonymous login failed: ${(error as Error).message}`)
      setWalletHint(`Anonymous login failed: ${(error as Error).message}`)
    } finally {
      setLoginBusy(false)
    }
  }, [authenticate, log, resetAuthSession, setLoginBusy, setWalletHint, syncUi])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink())
      log('Copied room link')
    } catch (error) {
      log(`Copy failed: ${(error as Error).message}`)
    }
  }, [log, shareLink])

  const handleLeaveRoom = useCallback(() => {
    const state = stateRef.current
    if (!state.socket || !state.room) return
    state.socket.send(JSON.stringify({ type: 'leave-room' }))
  }, [])

  const handleSwitchIdentity = useCallback(() => {
    const state = stateRef.current
    if (state.room && state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'leave-room' }))
    }

    resetAuthSession()
    state.address = null
    state.walletMode = null
    state.anonymousWallet = null

    if (state.socket && state.socket.readyState < WebSocket.CLOSING) {
      state.socket.close()
    }

    state.socket = null
    state.socketReadyPromise = null

    if (state.localStream) {
      for (const track of state.localStream.getTracks()) {
        track.stop()
      }
      state.localStream = null
    }

    window.history.replaceState({}, '', window.location.pathname)
    syncUi()
    log('Logged out')
  }, [log, resetAuthSession, syncUi])

  return (
    <div className="relative min-h-screen overflow-x-hidden text-[#e7fff3]">
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0 block h-screen w-screen"
      />

      <div className="relative z-10 mx-auto w-[min(1180px,calc(100%-32px))] py-8 pb-12">
        {!ui.sessionId ? (
          <section className="grid min-h-[calc(100vh-80px)] place-items-center gap-5">
            <p className="m-0 text-sm font-bold uppercase tracking-[0.18em] text-[#75ffbb]">Plasmodium</p>

            <Panel className="w-full max-w-[480px] text-center">
              <h1 className="m-0 text-[clamp(32px,7vw,54px)] leading-[0.95]">Sign in</h1>
              <p className="mt-3 text-[#92b9a5]">Choose an identity to enter Plasmodium.</p>

              <div className="mt-[18px] flex flex-col gap-3">
                <ActionButton disabled={ui.loginBusy || !window.ethereum} onClick={() => void handleWalletLogin()}>
                  {ui.loginBusy && ui.walletMode !== 'Anonymous' ? 'Logging in...' : 'Log in with Ethereum'}
                </ActionButton>
                <ActionButton variant="ghost" disabled={ui.loginBusy} onClick={() => void handleAnonymousLogin()}>
                  {ui.loginBusy && ui.walletMode === 'Anonymous' ? 'Entering...' : 'Continue anonymously'}
                </ActionButton>
              </div>

              <div className="mt-4 text-sm text-[#92b9a5]">{ui.walletHint}</div>
            </Panel>
          </section>
        ) : (
          <div>
            <header className="mb-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#75ffbb]">Ready to call</p>
                <h1 className="my-2 text-[clamp(44px,8vw,88px)] leading-[0.95]">Plasmodium</h1>
                <p className="max-w-[680px] text-lg text-[#92b9a5]">
                  Share a room link and the call will start automatically when someone joins you.
                </p>
              </div>

              <div className="grid min-w-0 gap-3 rounded-[20px] border border-emerald-200/10 bg-[rgba(4,10,8,0.76)] p-[18px] lg:min-w-[300px]">
                <div className="flex gap-4 max-sm:flex-col sm:justify-between">
                  <span className="text-[#92b9a5]">Wallet</span>
                  <strong className="break-all text-left sm:max-w-[240px] sm:text-right">{ui.address ?? 'Disconnected'}</strong>
                </div>
                <div className="flex gap-4 max-sm:flex-col sm:justify-between">
                  <span className="text-[#92b9a5]">Peer ID</span>
                  <strong className="break-all text-left sm:max-w-[240px] sm:text-right">{ui.appPeerId ?? '—'}</strong>
                </div>
              </div>
            </header>

            <main className="grid grid-cols-12 gap-[18px]">
              {!ui.room && (
                <Panel className="col-span-12 text-center">
                  <h2 className="text-2xl font-semibold">Join room</h2>
                  <p className="mt-3 text-[#92b9a5]">
                    Open a room to start your call. Once you join, Plasmodium will immediately request camera and
                    microphone access.
                  </p>
                  <div className="mt-[18px] flex flex-wrap justify-center gap-3">
                    <ActionButton disabled={!ui.sessionId} onClick={() => void joinRoom()}>
                      Join room
                    </ActionButton>
                    <ActionButton variant="ghost" onClick={handleSwitchIdentity}>
                      Log out
                    </ActionButton>
                  </div>
                </Panel>
              )}

              <Panel className="col-span-12">
                <div className="mb-[18px] flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">Call</h2>
                    <p className="mt-2 text-[#92b9a5]">{callStatus}</p>
                  </div>
                  <div className="rounded-full border border-emerald-200/12 bg-emerald-300/8 px-[14px] py-[10px] text-sm text-[#92b9a5]">
                    {presenceCount} {presenceCount === 1 ? 'person' : 'people'} here
                  </div>
                </div>

                {(ui.localStream || ui.remoteStream) && (
                  <div className="mb-5">
                    <div className="grid gap-[18px] md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                      {ui.remoteStream && (
                        <figure className="m-0">
                          <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="aspect-video min-h-[460px] w-full rounded-[18px] border border-emerald-200/16 bg-black object-cover"
                          />
                          <figcaption className="mt-2.5 text-sm text-[#92b9a5]">Remote</figcaption>
                        </figure>
                      )}

                      {ui.localStream && (
                        <figure className="m-0 self-end">
                          <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="aspect-video min-h-[150px] w-full rounded-[18px] border border-emerald-200/16 bg-black object-cover"
                          />
                          <figcaption className="mt-2.5 text-sm text-[#92b9a5]">You</figcaption>
                        </figure>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-[#92b9a5]">People here</h3>
                  {otherPeers.length === 0 ? (
                    <div className="mt-3 rounded-[14px] border border-emerald-200/10 bg-emerald-300/8 px-3 py-2.5">
                      No one else is here yet.
                    </div>
                  ) : (
                    <ul className="mt-3 grid list-none gap-2 p-0">
                      {otherPeers.map((peer) => (
                        <li
                          key={peer.from}
                          className="rounded-[14px] border border-emerald-200/10 bg-emerald-300/8 px-3 py-2.5"
                        >
                          <strong className="block break-all">{peer.address}</strong>
                          <small className="mt-1 block break-all text-[#92b9a5]">{peer.from}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-[18px] flex flex-wrap gap-3">
                  {ui.room && (
                    <>
                      <ActionButton onClick={() => void handleCopyLink()}>Copy invite link</ActionButton>
                      <ActionButton variant="ghost" onClick={handleLeaveRoom}>
                        Leave room
                      </ActionButton>
                    </>
                  )}
                </div>
              </Panel>

              <Panel className="col-span-12">
                <h2 className="text-2xl font-semibold">Activity</h2>
                <pre className="mt-4 min-h-[220px] max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-[#d4ffe8]">
                  {ui.logs.join('\n')}
                </pre>
              </Panel>
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
