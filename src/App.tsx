import {
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
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

function formatAddress(address: string | null) {
  if (!address) return 'Disconnected'
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function Panel({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={cn('glass-panel rounded-[32px] p-5 md:p-7', className)}>
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
        'relative overflow-hidden rounded-[20px] border px-5 py-3.5 text-sm font-semibold tracking-[0.01em] transition duration-200 disabled:cursor-not-allowed disabled:opacity-45',
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-linear-to-b before:from-white/22 before:to-transparent before:content-[""]',
        variant === 'primary'
          ? 'border-white/18 bg-linear-to-b from-[#edfffb]/90 via-[#cfffe8]/78 to-[#8af6cf]/74 text-[#08211d] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_18px_40px_rgba(91,255,200,0.18)] hover:scale-[1.01] hover:brightness-105'
          : 'glass-pill border-white/12 text-white/92 hover:bg-white/10',
        className
      )}
      {...props}
    >
      <span className="relative z-10">{children}</span>
    </button>
  )
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const [roomDraft, setRoomDraft] = useState(() => readRoomFromUrl() ?? '')
  const [callNotice, setCallNotice] = useState<string | null>(null)

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
    walletHint: 'Checking for an Ethereum wallet...',
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
        log('Starting call', { type: currentState.pc.localDescription?.type })
      } catch (error) {
        setCallNotice('The call could not be set up. Try joining the room again.')
        log(`Call setup failed: ${(error as Error).message}`)
        closePeerConnection()
      } finally {
        currentState.makingOffer = false
      }
    }

    state.pc.onconnectionstatechange = () => {
      const currentState = stateRef.current
      const connectionState = currentState.pc?.connectionState
      log('Call state changed', { state: connectionState })

      if (connectionState === 'connected') {
        setCallNotice(null)
      } else if (connectionState === 'failed') {
        setCallNotice('The call ended because the connection failed.')
        closePeerConnection()
      } else if (connectionState === 'disconnected' || connectionState === 'closed') {
        setCallNotice('The call ended because the connection was lost.')
        closePeerConnection()
      }

      syncUi()
    }

    syncUi()
  }, [closePeerConnection, log, sendSignal, syncUi, targetPeerId])

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
          log('Accepted incoming call', { from: payload.from })
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
    log('Camera and microphone ready')

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
        log('Signed in', message.session)
        return
      }

      if (message.type === 'joined-room') {
        stateRef.current.room = message.room
        setRoomDraft(message.room)
        setCallNotice(null)
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
        setCallNotice(null)
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
            log('Someone left the room', { address: payload.address, peerId: payload.from })
            if (currentState.pc || currentState.remoteStream) {
              setCallNotice('The call ended because the other person left the room.')
              closePeerConnection()
            }
          }
        } else {
          currentState.peers.set(payload.from, payload)
          if (payload.from !== currentState.appPeerId && !knownPeer) {
            log('Someone joined the room', { address: payload.address, peerId: payload.from })
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
      if (!room) return

      setCallNotice(null)
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
      log('Sign-in complete', { address: verified.address, walletMode: stateRef.current.walletMode })

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
          ? 'Ethereum wallet found. You can sign in with your wallet or continue anonymously.'
          : 'No Ethereum wallet found. You can still continue anonymously.'
      )
      setLoginBusy(false)
      syncUi()
      log('App ready')
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

  const otherPeers = useMemo(() => ui.peers.filter((peer) => peer.from !== ui.appPeerId), [ui.appPeerId, ui.peers])

  const presenceCount = otherPeers.length + (ui.room ? 1 : 0)

  const callStatus = useMemo(() => {
    if (!ui.room) return 'Join a room to start your call.'
    if (callNotice) return callNotice
    if (!ui.localStream) return 'Requesting camera and microphone access...'
    if (otherPeers.length === 0) return 'Waiting for someone else to join the room.'
    if (ui.remoteStream) return 'Call connected.'
    return 'Connecting your call...'
  }, [callNotice, otherPeers.length, ui.localStream, ui.remoteStream, ui.room])

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
      stateRef.current.walletMode = 'Guest'
      syncUi()

      await authenticate(anonymousWallet.address, (message) => anonymousWallet.signMessage(message))
    } catch (error) {
      log(`Guest sign-in failed: ${(error as Error).message}`)
      setWalletHint(`Guest sign-in failed: ${(error as Error).message}`)
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
    setCallNotice(null)
    state.socket.send(JSON.stringify({ type: 'leave-room' }))
  }, [])

  const handleSwitchIdentity = useCallback(() => {
    const state = stateRef.current
    setCallNotice(null)
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
      log('Signed out')
  }, [log, resetAuthSession, syncUi])

  const handleJoinRoom = useCallback(async () => {
    await joinRoom(roomDraft)
  }, [joinRoom, roomDraft])

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 block h-screen w-screen" />
      <div className="pointer-events-none fixed inset-0 z-[2] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_30%),radial-gradient(circle_at_20%_18%,rgba(126,255,219,0.09),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(140,184,255,0.12),transparent_22%),linear-gradient(180deg,rgba(7,13,20,0.1),rgba(3,6,8,0.58)_55%,rgba(2,3,6,0.72))]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[3] h-28 bg-linear-to-b from-white/12 to-transparent opacity-70" />

      <div className="relative z-10 mx-auto w-[min(1220px,calc(100%-24px))] px-2 py-4 md:w-[min(1320px,calc(100%-40px))] md:px-0 md:py-6">
        {!ui.sessionId ? (
          <section className="grid min-h-[calc(100vh-48px)] place-items-center">
            <div className="w-full max-w-[1080px] rounded-[42px] border border-white/10 bg-white/[0.045] p-3 shadow-[0_24px_120px_rgba(0,0,0,0.35)] backdrop-blur-sm">
              <div className="glass-panel grid overflow-hidden rounded-[34px] border-white/14 md:grid-cols-[1.15fr_0.85fr]">
                <div className="relative p-7 md:p-10">
                  <div className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/72">
                    <span className="h-2 w-2 rounded-full bg-[#98f9d9] shadow-[0_0_16px_rgba(152,249,217,0.9)]" />
                    Private video room
                  </div>
                  <p className="mt-7 text-sm uppercase tracking-[0.34em] text-white/50">Private video call</p>
                  <h1 className="hero-glow mt-4 max-w-[10ch] text-[clamp(58px,11vw,122px)] font-medium leading-[0.88] tracking-[-0.06em] text-white">
                    Talk like nobody's listening.
                  </h1>
                  <p className="mt-6 max-w-[560px] text-[17px] leading-7 text-white/68 md:text-[19px]">
                    Peer-to-peer video with verifiable Ethereum identity, so you can prove who owns the address on the other end.
                  </p>
                  <p className="mt-4 max-w-[560px] text-sm leading-6 text-white/50">
                    No room host in the middle, no broadcast audience, just a direct call with cryptographic proof of who you're speaking to.
                  </p>

                  <div className="mt-10 grid gap-3 sm:grid-cols-3">
                    <div className="glass-pill rounded-[24px] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Identity</div>
                      <div className="mt-2 text-base text-white/88">Verified wallet or private guest</div>
                    </div>
                    <div className="glass-pill rounded-[24px] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Privacy</div>
                      <div className="mt-2 text-base text-white/88">Peer-to-peer, not room-to-server</div>
                    </div>
                    <div className="glass-pill rounded-[24px] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Trust</div>
                      <div className="mt-2 text-base text-white/88">Prove the address behind the voice</div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 p-4 md:border-t-0 md:border-l md:p-5">
                  <Panel className="h-full rounded-[28px] border-white/14 bg-white/[0.06] text-center shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/16 bg-white/10 text-lg text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                      ✦
                    </div>
                    <h2 className="mt-5 text-[38px] font-medium tracking-[-0.04em] text-white">Sign in</h2>
                    <p className="mt-3 text-[15px] leading-6 text-white/62">Choose private guest access or prove wallet ownership.</p>

                    <div className="mt-7 flex flex-col gap-3">
                      <ActionButton disabled={ui.loginBusy || !window.ethereum} onClick={() => void handleWalletLogin()}>
                        {ui.loginBusy && ui.walletMode !== 'Guest' ? 'Signing in...' : 'Sign in with Ethereum'}
                      </ActionButton>
                      <ActionButton variant="ghost" disabled={ui.loginBusy} onClick={() => void handleAnonymousLogin()}>
                        {ui.loginBusy && ui.walletMode === 'Guest' ? 'Joining as guest...' : 'Continue as guest'}
                      </ActionButton>
                    </div>

                    <div className="mt-6 rounded-[22px] border border-white/10 bg-black/12 px-4 py-3 text-left text-sm leading-6 text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      {ui.walletHint}
                    </div>
                  </Panel>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            <header className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] xl:items-stretch">
              <Panel className="rounded-[30px] border-white/14 px-5 py-4 md:px-6 md:py-5">
                <div className="flex h-full flex-col justify-center gap-3 md:flex-row md:items-center md:justify-between md:gap-5">
                  <div className="min-w-0">
                    <div className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-white/56">
                      <span className="h-2 w-2 rounded-full bg-[#95d6ff] shadow-[0_0_18px_rgba(149,214,255,0.9)]" />
                      Private by default
                    </div>
                    <p className="mt-3 max-w-[640px] text-[15px] leading-6 text-white/62 md:text-[16px]">
                      Share a room link for a direct peer-to-peer call, with optional Ethereum address verification.
                    </p>
                  </div>
                  {ui.room && (
                    <div className="glass-pill inline-flex w-fit shrink-0 rounded-full px-4 py-3 text-sm text-white/74">
                      Room {ui.room}
                    </div>
                  )}
                </div>
              </Panel>

              <Panel className="rounded-[30px] border-white/14 p-3 md:p-4">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="glass-pill rounded-[22px] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Identity</div>
                    <div className="mt-1.5 text-sm text-white/92">{ui.walletMode ?? 'Disconnected'}</div>
                    <div className="mt-1 break-all text-sm text-white/58">{formatAddress(ui.address)}</div>
                  </div>
                  <div className="glass-pill rounded-[22px] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Peer ID</div>
                    <div className="mt-1.5 break-all text-sm text-white/72">{ui.appPeerId ?? '—'}</div>
                  </div>
                </div>
              </Panel>
            </header>

            <main className="grid grid-cols-12 gap-5">
              {!ui.room && (
                <Panel className="col-span-12 rounded-[34px] border-white/14 p-5 md:p-7">
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
                        className="glass-input min-w-0 rounded-[22px] px-4 py-3.5 text-sm text-white outline-none"
                        placeholder="Enter a room name"
                        value={roomDraft}
                        onChange={(event) => setRoomDraft(event.target.value)}
                      />
                      <ActionButton disabled={!ui.sessionId || !roomDraft.trim()} type="submit">
                        Join room
                      </ActionButton>
                      <ActionButton variant="ghost" type="button" onClick={() => setRoomDraft(makeRoomName())}>
                        Random room
                      </ActionButton>
                    </form>
                    <div className="flex flex-wrap gap-3">
                      <ActionButton variant="ghost" onClick={handleSwitchIdentity}>
                        Log out
                      </ActionButton>
                    </div>
                  </div>
                </Panel>
              )}

              <Panel className="col-span-12 rounded-[34px] border-white/14 p-4 md:p-5">
                <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Call</div>
                    <h2 className="mt-2 text-[34px] font-medium tracking-[-0.05em] text-white">Video call</h2>
                    <p className="mt-2 max-w-[560px] text-white/60">{callStatus}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {ui.room && <div className="glass-pill inline-flex rounded-full px-4 py-3 text-sm text-white/74">Room {ui.room}</div>}
                    <div className="glass-pill inline-flex rounded-full px-4 py-3 text-sm text-white/70">
                      {presenceCount} {presenceCount === 1 ? 'person' : 'people'} here
                    </div>
                  </div>
                </div>

                {callNotice && ui.room && (
                  <div className="mb-5 rounded-[24px] border border-rose-200/18 bg-rose-300/10 px-4 py-3 text-sm text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    {callNotice}
                  </div>
                )}

                {(ui.localStream || ui.remoteStream) && (
                  <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                    {ui.remoteStream ? (
                      <figure className="glass-panel m-0 overflow-hidden rounded-[30px] border border-white/14 p-2">
                        <video
                          ref={remoteVideoRef}
                          autoPlay
                          playsInline
                          className="aspect-video min-h-[460px] w-full rounded-[24px] border border-white/10 bg-black/60 object-cover"
                        />
                        <figcaption className="px-2 pb-1 pt-3 text-sm text-white/58">Other person</figcaption>
                      </figure>
                    ) : (
                      <div className="glass-panel grid min-h-[460px] place-items-center rounded-[30px] border border-white/14 bg-black/12 p-6 text-center">
                        <div>
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/14 bg-white/10 text-2xl">
                            ◎
                          </div>
                          <p className="mt-5 text-lg text-white/78">Waiting for someone to join</p>
                          <p className="mt-2 text-sm text-white/48">Their video will appear here when the call connects.</p>
                        </div>
                      </div>
                    )}

                    {ui.localStream && (
                      <figure className="glass-panel m-0 self-end overflow-hidden rounded-[28px] border border-white/14 p-2">
                        <video
                          ref={localVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="aspect-video min-h-[170px] w-full rounded-[22px] border border-white/10 bg-black/60 object-cover"
                        />
                        <figcaption className="px-2 pb-1 pt-3 text-sm text-white/58">You</figcaption>
                      </figure>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {ui.room && (
                    <>
                      <ActionButton onClick={() => void handleCopyLink()}>Copy invite link</ActionButton>
                      <ActionButton variant="ghost" onClick={handleLeaveRoom}>
                        Leave room
                      </ActionButton>
                      <ActionButton variant="ghost" onClick={handleSwitchIdentity}>
                        Switch identity
                      </ActionButton>
                    </>
                  )}
                </div>
              </Panel>

              <div className="col-span-12 grid gap-5">
                <Panel className="rounded-[34px] border-white/14 p-5 md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Presence</div>
                      <h3 className="mt-2 text-[28px] font-medium tracking-[-0.05em] text-white">People here</h3>
                    </div>
                    <div className="glass-pill rounded-full px-3 py-2 text-xs text-white/64">{otherPeers.length} remote</div>
                  </div>
                  {otherPeers.length === 0 ? (
                    <div className="glass-pill mt-5 rounded-[24px] px-4 py-4 text-white/56">No one else is here yet.</div>
                  ) : (
                    <ul className="mt-5 grid list-none gap-3 p-0">
                      {otherPeers.map((peer) => (
                        <li key={peer.from} className="glass-pill rounded-[24px] px-4 py-4">
                          <strong className="block break-all text-white/92">{peer.address}</strong>
                          <small className="mt-2 block break-all text-white/48">{peer.from}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel className="rounded-[34px] border-white/14 p-5 md:p-6">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Activity</div>
                  <h3 className="mt-2 text-[28px] font-medium tracking-[-0.05em] text-white">Activity log</h3>
                  <pre className="mt-5 max-h-[420px] min-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-[24px] border border-white/10 bg-black/18 p-4 text-[13px] leading-6 text-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    {ui.logs.join('\n')}
                  </pre>
                </Panel>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
