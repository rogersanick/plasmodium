import { ethers } from 'https://esm.sh/ethers@6.15.0'
import { startPhysarumBackground } from '/vendor/physarum-client.js'

const els = {
  loginView: document.getElementById('loginView'),
  appView: document.getElementById('appView'),
  preJoinPanel: document.getElementById('preJoinPanel'),
  walletValue: document.getElementById('walletValue'),
  peerIdValue: document.getElementById('peerIdValue'),
  walletHint: document.getElementById('walletHint'),
  connectButton: document.getElementById('connectButton'),
  anonymousJoinButton: document.getElementById('anonymousJoinButton'),
  switchIdentityButton: document.getElementById('switchIdentityButton'),
  joinButton: document.getElementById('joinButton'),
  leaveButton: document.getElementById('leaveButton'),
  copyLinkButton: document.getElementById('copyLinkButton'),
  presenceCount: document.getElementById('presenceCount'),
  callStatus: document.getElementById('callStatus'),
  peerList: document.getElementById('peerList'),
  localVideo: document.getElementById('localVideo'),
  remoteVideo: document.getElementById('remoteVideo'),
  localFigure: document.getElementById('localFigure'),
  remoteFigure: document.getElementById('remoteFigure'),
  videoShell: document.getElementById('videoShell'),
  log: document.getElementById('log')
}

try {
  startPhysarumBackground({ canvas: document.getElementById('physarumBackground') })
} catch (error) {
  console.error('Physarum background failed to start', error)
}

const state = {
  config: null,
  address: null,
  walletMode: null,
  anonymousWallet: null,
  sessionId: null,
  appPeerId: null,
  socket: null,
  socketReadyPromise: null,
  room: new URLSearchParams(location.search).get('room') || null,
  localStream: null,
  remoteStream: null,
  pc: null,
  peers: new Map(),
  announcedPeers: new Set(),
  makingOffer: false,
  ignoreOffer: false,
  polite: false,
  loginBusy: false,
  hasPromptedForMedia: false
}

function log(message, payload) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}${payload ? ` ${JSON.stringify(payload)}` : ''}`
  els.log.textContent = `${line}\n${els.log.textContent}`
}

function makeRoomName() {
  return `room-${crypto.randomUUID().slice(0, 8)}`
}

function shareLink() {
  const url = new URL(location.href)
  if (state.room) url.searchParams.set('room', state.room)
  return url.toString()
}

function showAppView() {
  els.loginView.classList.add('hidden')
  els.appView.classList.remove('hidden')
}

function showLoginView() {
  els.appView.classList.add('hidden')
  els.loginView.classList.remove('hidden')
}

function setLoginBusy(busy, source = null) {
  state.loginBusy = busy
  els.connectButton.disabled = busy || !window.ethereum
  els.anonymousJoinButton.disabled = busy
  els.connectButton.textContent = source === 'wallet' && busy ? 'Logging in…' : 'Log in with Ethereum'
  els.anonymousJoinButton.textContent = source === 'anonymous' && busy ? 'Entering…' : 'Continue anonymously'
}

function updatePresenceCount() {
  const count = [...state.peers.values()].filter((peer) => peer.from !== state.appPeerId).length + (state.room ? 1 : 0)
  els.presenceCount.textContent = `${count} ${count === 1 ? 'person' : 'people'} here`
}

function updateCallStatus() {
  if (!state.room) {
    els.callStatus.textContent = 'Join a room to start your call.'
    return
  }
  if (!state.localStream) {
    els.callStatus.textContent = 'Requesting camera and microphone access…'
    return
  }
  const otherCount = [...state.peers.values()].filter((peer) => peer.from !== state.appPeerId).length
  if (otherCount === 0) {
    els.callStatus.textContent = 'Waiting for someone else to join the room.'
    return
  }
  if (state.remoteStream) {
    els.callStatus.textContent = 'Call connected.'
    return
  }
  els.callStatus.textContent = 'Connecting call…'
}

function renderPeers() {
  const entries = [...state.peers.values()].filter((peer) => peer.from !== state.appPeerId)
  if (entries.length === 0) {
    els.peerList.innerHTML = '<li>No one else is here yet.</li>'
    return
  }
  els.peerList.innerHTML = entries.map((peer) => `<li><strong>${peer.address}</strong><br /><small>${peer.from}</small></li>`).join('')
}

function updateVideoVisibility() {
  const showLocal = Boolean(state.localStream)
  const showRemote = Boolean(state.remoteStream)
  els.localFigure.classList.toggle('hidden', !showLocal)
  els.remoteFigure.classList.toggle('hidden', !showRemote)
  els.videoShell.classList.toggle('hidden', !(showLocal || showRemote))
}

function updateUi() {
  els.walletValue.textContent = state.address ?? 'Disconnected'
  els.peerIdValue.textContent = state.appPeerId ?? '—'
  els.joinButton.disabled = !state.sessionId
  els.leaveButton.classList.toggle('hidden', !state.room)
  els.copyLinkButton.classList.toggle('hidden', !state.room)
  els.preJoinPanel.classList.toggle('hidden', Boolean(state.room))
  updatePresenceCount()
  updateCallStatus()
  updateVideoVisibility()
}

function closePeerConnection() {
  if (state.pc) {
    state.pc.ontrack = null
    state.pc.onicecandidate = null
    state.pc.onnegotiationneeded = null
    state.pc.close()
  }
  state.pc = null
  state.remoteStream = null
  els.remoteVideo.srcObject = null
}

function resetAuthSession() {
  state.sessionId = null
  state.appPeerId = null
  state.room = new URLSearchParams(location.search).get('room') || null
  state.peers.clear()
  state.announcedPeers.clear()
  state.hasPromptedForMedia = false
  closePeerConnection()
  renderPeers()
  updateUi()
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {})
    }
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`)
  return body
}

function targetPeerId() {
  const others = [...state.peers.values()].filter((peer) => peer.from !== state.appPeerId)
  return others[0]?.from ?? null
}

async function ensureSocket() {
  if (state.socket?.readyState === WebSocket.OPEN) return state.socket
  if (state.socketReadyPromise) {
    await state.socketReadyPromise
    return state.socket
  }

  state.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`)
  state.socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data)

    if (message.type === 'session-bound') {
      log('Logged in', message.session)
      return
    }

    if (message.type === 'joined-room') {
      state.room = message.room
      history.replaceState({}, '', `${location.pathname}?room=${encodeURIComponent(message.room)}`)
      updateUi()
      log('Joined room', { room: message.room })
      state.socket.send(JSON.stringify({ type: 'presence-ping' }))
      await maybePromptMedia()
      return
    }

    if (message.type === 'left-room') {
      state.room = null
      state.peers.clear()
      state.hasPromptedForMedia = false
      closePeerConnection()
      renderPeers()
      history.replaceState({}, '', location.pathname)
      updateUi()
      log('Left room')
      return
    }

    if (message.type === 'presence') {
      const payload = message.payload
      if (!payload?.from) return

      const knownPeer = state.peers.has(payload.from)
      if (payload.kind === 'leave') {
        state.peers.delete(payload.from)
        state.announcedPeers.delete(payload.from)
        if (payload.from !== state.appPeerId) {
          log('Peer left room', { address: payload.address, peerId: payload.from })
        }
      } else {
        state.peers.set(payload.from, payload)
        if (payload.from !== state.appPeerId && !knownPeer) {
          log('Peer joined room', { address: payload.address, peerId: payload.from })
          if (!state.announcedPeers.has(payload.from) && state.socket?.readyState === WebSocket.OPEN) {
            state.announcedPeers.add(payload.from)
            state.socket.send(JSON.stringify({ type: 'presence-ping' }))
          }
        }
      }
      renderPeers()
      updateUi()
      if (state.localStream && targetPeerId() && !state.pc) await startPeerConnection()
      return
    }

    if (message.type === 'signal') {
      await handleSignal(message.payload)
      return
    }

    if (message.type === 'error') log(`Error: ${message.error}`)
  })

  state.socketReadyPromise = new Promise((resolve, reject) => {
    const handleOpen = () => {
      state.socket.send(JSON.stringify({ type: 'bind-session', sessionId: state.sessionId }))
      state.socketReadyPromise = null
      resolve(state.socket)
    }
    const handleError = (event) => {
      state.socketReadyPromise = null
      reject(event?.error ?? new Error('WebSocket connection failed'))
    }
    state.socket.addEventListener('open', handleOpen, { once: true })
    state.socket.addEventListener('error', handleError, { once: true })
  })

  await state.socketReadyPromise
  return state.socket
}

async function sendSignal(payload) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) throw new Error('WebSocket not connected')
  state.socket.send(JSON.stringify({ type: 'signal-send', payload }))
}

async function ensureMedia() {
  if (state.localStream) return state.localStream
  state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  els.localVideo.srcObject = state.localStream
  updateUi()
  log('Camera and microphone are on')
  if (targetPeerId() && !state.pc) await startPeerConnection()
  return state.localStream
}

async function maybePromptMedia() {
  if (!state.room || state.hasPromptedForMedia) return
  state.hasPromptedForMedia = true
  updateUi()
  try {
    await ensureMedia()
  } catch (error) {
    state.hasPromptedForMedia = false
    log(`Media access failed: ${error.message}`)
    updateUi()
  }
}

async function startPeerConnection() {
  const remotePeerId = targetPeerId()
  if (!remotePeerId) {
    updateUi()
    return
  }

  state.polite = state.appPeerId > remotePeerId
  state.remoteStream = new MediaStream()
  els.remoteVideo.srcObject = state.remoteStream
  state.pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] })

  for (const track of state.localStream.getTracks()) state.pc.addTrack(track, state.localStream)

  state.pc.ontrack = ({ streams }) => {
    for (const track of streams[0].getTracks()) state.remoteStream.addTrack(track)
    updateUi()
  }

  state.pc.onicecandidate = ({ candidate }) => {
    if (candidate) sendSignal({ kind: 'ice', to: remotePeerId, candidate })
  }

  state.pc.onnegotiationneeded = async () => {
    try {
      state.makingOffer = true
      await state.pc.setLocalDescription()
      await sendSignal({ kind: 'description', to: remotePeerId, description: state.pc.localDescription })
      log('Starting call setup', { type: state.pc.localDescription.type })
    } catch (error) {
      log(`Call setup failed: ${error.message}`)
    } finally {
      state.makingOffer = false
    }
  }

  state.pc.onconnectionstatechange = () => {
    log('Call state changed', { state: state.pc.connectionState })
    updateUi()
  }
}

async function handleSignal(payload) {
  if (!payload || payload.from === state.appPeerId) return
  if (payload.to && payload.to !== state.appPeerId) return
  if (!state.localStream) return
  if (!state.pc) await startPeerConnection()
  const pc = state.pc

  if (payload.kind === 'description') {
    const offerCollision = payload.description.type === 'offer' && (state.makingOffer || pc.signalingState !== 'stable')
    state.ignoreOffer = !state.polite && offerCollision
    if (state.ignoreOffer) return

    await pc.setRemoteDescription(payload.description)
    if (payload.description.type === 'offer') {
      await pc.setLocalDescription()
      await sendSignal({ kind: 'description', to: payload.from, description: pc.localDescription })
      log('Accepted incoming call setup', { from: payload.from })
    }
    return
  }

  if (payload.kind === 'ice' && payload.candidate) {
    try {
      await pc.addIceCandidate(payload.candidate)
    } catch (error) {
      if (!state.ignoreOffer) log(`Network candidate failed: ${error.message}`)
    }
  }
}

async function authenticate(address, signer) {
  const challenge = await fetchJson('/api/auth/request', {
    method: 'POST',
    body: JSON.stringify({ address, chainId: 1 })
  })
  const signature = await signer(challenge.message)
  const verified = await fetchJson('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ nonce: challenge.nonce, signature })
  })

  state.sessionId = verified.sessionId
  state.appPeerId = verified.appPeerId
  updateUi()
  showAppView()
  log('Login complete', { address: verified.address, walletMode: state.walletMode })

  try {
    await ensureSocket()
  } catch (error) {
    log(`Realtime connection failed: ${error.message}`)
  }

  if (state.room) {
    await joinRoom(state.room)
  }
}

async function joinRoom(roomName) {
  await ensureSocket()
  const room = (roomName || state.room || makeRoomName()).trim()
  state.room = room
  history.replaceState({}, '', `${location.pathname}?room=${encodeURIComponent(room)}`)
  updateUi()
  state.socket.send(JSON.stringify({ type: 'join-room', room }))
}

els.connectButton.addEventListener('click', async () => {
  try {
    if (!window.ethereum) {
      els.walletHint.textContent = 'No Ethereum wallet found. You can still continue anonymously.'
      return
    }
    setLoginBusy(true, 'wallet')
    resetAuthSession()
    state.anonymousWallet = null
    const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' })
    state.address = address
    state.walletMode = 'Ethereum wallet'
    await authenticate(address, (message) => window.ethereum.request({ method: 'personal_sign', params: [message, address] }))
  } catch (error) {
    log(`Login failed: ${error.message}`)
    els.walletHint.textContent = `Login failed: ${error.message}`
  } finally {
    setLoginBusy(false)
  }
})

els.anonymousJoinButton.addEventListener('click', async () => {
  try {
    setLoginBusy(true, 'anonymous')
    resetAuthSession()
    state.anonymousWallet = ethers.Wallet.createRandom()
    state.address = state.anonymousWallet.address
    state.walletMode = 'Anonymous'
    await authenticate(state.address, (message) => state.anonymousWallet.signMessage(message))
  } catch (error) {
    log(`Anonymous login failed: ${error.message}`)
    els.walletHint.textContent = `Anonymous login failed: ${error.message}`
  } finally {
    setLoginBusy(false)
  }
})

els.joinButton.addEventListener('click', async () => {
  try {
    await joinRoom()
  } catch (error) {
    log(`Join failed: ${error.message}`)
  }
})

els.copyLinkButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareLink())
    log('Copied room link')
  } catch (error) {
    log(`Copy failed: ${error.message}`)
  }
})

els.leaveButton.addEventListener('click', async () => {
  if (!state.socket || !state.room) return
  state.socket.send(JSON.stringify({ type: 'leave-room' }))
})

els.switchIdentityButton.addEventListener('click', async () => {
  if (state.room && state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ type: 'leave-room' }))
  resetAuthSession()
  state.address = null
  state.walletMode = null
  state.anonymousWallet = null
  state.socket = null
  state.socketReadyPromise = null
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) track.stop()
    state.localStream = null
    els.localVideo.srcObject = null
  }
  history.replaceState({}, '', location.pathname)
  showLoginView()
  updateUi()
  log('Logged out')
})

const config = await fetchJson('/api/config')
state.config = config
els.walletHint.textContent = window.ethereum
  ? 'Ethereum wallet detected. Or continue anonymously.'
  : 'No Ethereum wallet detected. Continue anonymously to enter.'
setLoginBusy(false)
updateUi()
renderPeers()
showLoginView()
log('Plasmodium loaded')
