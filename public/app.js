import { ethers } from 'https://esm.sh/ethers@6.15.0'
import { joinRoom as joinTrysteroRoom, selfId } from 'https://esm.sh/trystero@0.21.0'
import { startPhysarumBackground } from '/physarum-background.js'

const APP_ID = 'plasmodium'
const PRESENCE_ACTION = 'plasmodium:presence'
const CHAT_ACTION = 'plasmodium:chat'
const STAGE_ACTION = 'plasmodium:stage'
const SIGNAL_ACTION = 'plasmodium:signal'

const els = {
  loginView: document.getElementById('loginView'),
  appView: document.getElementById('appView'),
  preJoinPanel: document.getElementById('preJoinPanel'),
  walletValue: document.getElementById('walletValue'),
  peerIdValue: document.getElementById('peerIdValue'),
  roomValue: document.getElementById('roomValue'),
  walletHint: document.getElementById('walletHint'),
  connectButton: document.getElementById('connectButton'),
  anonymousJoinButton: document.getElementById('anonymousJoinButton'),
  switchIdentityButton: document.getElementById('switchIdentityButton'),
  joinButton: document.getElementById('joinButton'),
  leaveButton: document.getElementById('leaveButton'),
  copyLinkButton: document.getElementById('copyLinkButton'),
  goLiveButton: document.getElementById('goLiveButton'),
  watchStageButton: document.getElementById('watchStageButton'),
  leaveStageButton: document.getElementById('leaveStageButton'),
  presenceCount: document.getElementById('presenceCount'),
  callStatus: document.getElementById('callStatus'),
  peerList: document.getElementById('peerList'),
  roomMetaGrid: document.getElementById('roomMetaGrid'),
  roomContentGrid: document.getElementById('roomContentGrid'),
  localVideo: document.getElementById('localVideo'),
  localFigure: document.getElementById('localFigure'),
  videoShell: document.getElementById('videoShell'),
  remoteVideoGrid: document.getElementById('remoteVideoGrid'),
  log: document.getElementById('log'),
  peerViz: document.getElementById('peerViz')
}

try {
  startPhysarumBackground({ canvas: document.getElementById('physarumBackground') })
} catch (error) {
  console.error('Physarum background failed to start', error)
}

const state = {
  address: null,
  walletMode: null,
  anonymousWallet: null,
  sessionId: null,
  signer: null,
  roomSignatures: new Set(),
  room: new URLSearchParams(location.search).get('room') || null,
  roomHandle: null,
  sendPresence: null,
  sendChat: null,
  sendStage: null,
  sendSignal: null,
  peers: new Map(),
  localStream: null,
  remoteStreams: new Map(),
  role: 'audience',
  peerConnections: new Map(),
  stage: { publisherId: null, publisherAddress: null, viewers: new Set(), livePeers: new Map() },
  loginBusy: false
}

function escapeHtml(text) {
  return String(text).replace(/[&<>\"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
}

function makeRoomName() {
  return `room-${crypto.randomUUID().slice(0, 8)}`
}

function shareLink() {
  const url = new URL(location.href)
  if (state.room) url.searchParams.set('room', state.room)
  return url.toString()
}

function shortAddress(address) {
  if (!address) return 'Disconnected'
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function shortPeerName(peer) {
  if (!peer) return 'peer'
  return peer.address || peer.displayName || peer.peerId?.slice(0, 10) || 'peer'
}

function showAppView() {
  els.loginView.classList.add('hidden')
  els.appView.classList.remove('hidden')
}

function showLoginView() {
  els.appView.classList.add('hidden')
  els.loginView.classList.remove('hidden')
}

function log(message, payload) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}${payload ? ` ${JSON.stringify(payload)}` : ''}`
  els.log.textContent = `${line}\n${els.log.textContent}`
}

function setLoginBusy(busy, source = null) {
  state.loginBusy = busy
  els.connectButton.disabled = busy || !window.ethereum
  els.anonymousJoinButton.disabled = busy
  els.connectButton.textContent = source === 'wallet' && busy ? 'Signing in…' : 'Sign in with Ethereum'
  els.anonymousJoinButton.textContent = source === 'anonymous' && busy ? 'Entering…' : 'Or enter anonymously'
}

function snapshotParticipants() {
  const remote = [...state.peers.entries()].map(([peerId, peer]) => ({ peerId, ...peer }))
  return state.roomHandle
    ? [{ peerId: selfId, address: state.address, walletMode: state.walletMode, role: state.role, self: true }, ...remote]
    : []
}

function updatePresenceCount() {
  const count = snapshotParticipants().length
  els.presenceCount.textContent = `${count} ${count === 1 ? 'person' : 'people'} here`
}

function renderPeers() {
  const entries = snapshotParticipants()
  els.peerList.innerHTML = entries.length === 0
    ? '<li>No participants yet.</li>'
    : entries.map((peer) => {
        const liveLabel = peer.role === 'publisher' ? 'live' : peer.role || 'audience'
        const selfLabel = peer.self ? ' (you)' : ''
        return `<li><strong>${escapeHtml(shortPeerName(peer))}${selfLabel}</strong><br /><small>${escapeHtml(liveLabel)}</small></li>`
      }).join('')
}

function renderPeerViz() {
  const peers = snapshotParticipants()
  if (!els.peerViz) return
  if (peers.length === 0) {
    els.peerViz.innerHTML = '<div class="graph-empty">No peers yet.</div>'
    return
  }

  const width = 320
  const height = 220
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.32

  const others = peers.filter((peer) => !peer.self)
  const nodes = [
    { peerId: selfId, label: shortPeerName(peers.find((peer) => peer.self)), x: cx, y: cy, self: true, live: state.role === 'publisher' },
    ...others.map((peer, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(others.length, 1) - Math.PI / 2
      return {
        peerId: peer.peerId,
        label: shortPeerName(peer),
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        self: false,
        live: peer.role === 'publisher'
      }
    })
  ]

  const lines = others.map((peer, index) => {
    const node = nodes[index + 1]
    return `<line x1="${cx}" y1="${cy}" x2="${node.x}" y2="${node.y}" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />`
  }).join('')

  const circles = nodes.map((node) => {
    const fill = node.self ? '#d7fff1' : node.live ? '#8ef7d4' : '#9cccff'
    const stroke = node.live ? 'rgba(142,247,212,0.9)' : 'rgba(255,255,255,0.28)'
    const r = node.self ? 11 : 9
    return `
      <g>
        <circle cx="${node.x}" cy="${node.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
        <text x="${node.x + 14}" y="${node.y + 4}" fill="rgba(255,255,255,0.72)" font-size="12" font-family="system-ui, sans-serif">${escapeHtml(node.label)}</text>
      </g>
    `
  }).join('')

  els.peerViz.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="220" aria-label="Peer network">
      ${lines}
      ${circles}
    </svg>
  `
}

function updateCallStatus() {
  const liveCount = state.stage.livePeers.size
  const remoteCount = state.remoteStreams.size
  if (!state.room) {
    els.callStatus.textContent = 'Join a room to enter.'
    return
  }
  if (!state.localStream && state.role === 'publisher') {
    els.callStatus.textContent = 'Preparing your camera and microphone…'
    return
  }
  if (state.role === 'publisher') {
    els.callStatus.textContent = `You are live${state.stage.viewers.size ? ` for ${state.stage.viewers.size} viewer${state.stage.viewers.size === 1 ? '' : 's'}` : ''}.`
    return
  }
  if (remoteCount > 0) {
    els.callStatus.textContent = `Receiving ${remoteCount} remote stream${remoteCount === 1 ? '' : 's'}.`
    return
  }
  if (liveCount > 0) {
    els.callStatus.textContent = `${liveCount} live participant${liveCount === 1 ? '' : 's'} available.`
    return
  }
  els.callStatus.textContent = 'No one is live yet. You can join and go live.'
}

function renderRemoteVideos() {
  els.remoteVideoGrid.innerHTML = ''
  for (const [peerId, stream] of state.remoteStreams.entries()) {
    const card = document.createElement('figure')
    card.className = 'remote-video-card'
    const video = document.createElement('video')
    video.autoplay = true
    video.playsInline = true
    video.srcObject = stream
    const caption = document.createElement('figcaption')
    caption.textContent = shortPeerName(state.peers.get(peerId) || { peerId })
    card.append(video, caption)
    els.remoteVideoGrid.appendChild(card)
  }
}

function updateVideoVisibility() {
  els.localFigure.classList.toggle('hidden', !state.localStream)
  els.videoShell.classList.toggle('hidden', !state.localStream && state.remoteStreams.size === 0)
  renderRemoteVideos()
}

function updateUi() {
  els.walletValue.textContent = state.address ? `${shortAddress(state.address)} · ${state.walletMode}` : 'Disconnected'
  els.peerIdValue.textContent = state.roomHandle ? selfId : '—'
  els.roomValue.textContent = state.room ?? '—'
  els.joinButton.disabled = !state.sessionId
  els.leaveButton.classList.toggle('hidden', !state.room)
  els.copyLinkButton.classList.toggle('hidden', !state.room)
  els.goLiveButton.classList.toggle('hidden', !state.room || state.role === 'publisher')
  els.watchStageButton.classList.toggle('hidden', !state.room || state.stage.livePeers.size === 0 || state.role === 'publisher')
  els.leaveStageButton.classList.toggle('hidden', !state.room || (state.role === 'audience' && state.remoteStreams.size === 0))
  els.preJoinPanel.classList.toggle('hidden', Boolean(state.room))
  els.roomContentGrid.classList.toggle('hidden', !state.room)
  els.roomMetaGrid.classList.toggle('hidden', !state.room)
  updatePresenceCount()
  renderPeers()
  renderPeerViz()
  updateCallStatus()
  updateVideoVisibility()
}

function removeRemoteStream(peerId) {
  state.remoteStreams.delete(peerId)
}

function closePeerConnection(peerId) {
  const pc = state.peerConnections.get(peerId)
  if (pc) {
    try { pc.close() } catch {}
    state.peerConnections.delete(peerId)
  }
  removeRemoteStream(peerId)
}

function closeAllPeerConnections() {
  for (const peerId of state.peerConnections.keys()) closePeerConnection(peerId)
  state.remoteStreams.clear()
}

function resetStageState() {
  state.stage = { publisherId: null, publisherAddress: null, viewers: new Set(), livePeers: new Map() }
  state.role = 'audience'
}

function resetRoomState() {
  resetStageState()
  closeAllPeerConnections()
  state.peers.clear()
  updateUi()
}

function resetAuthSession() {
  state.sessionId = null
  state.signer = null
  state.roomSignatures = new Set()
  state.room = new URLSearchParams(location.search).get('room') || null
  resetRoomState()
}

function localPresence(kind = 'announce') {
  return {
    kind,
    issuedAt: new Date().toISOString(),
    peerId: selfId,
    address: state.address,
    walletMode: state.walletMode,
    role: state.role,
    room: state.room
  }
}

async function publishPresence(targetPeers = null) {
  if (!state.sendPresence || !state.room) return
  await state.sendPresence(localPresence('announce'), targetPeers)
}

async function publishStage(targetPeers = null) {
  if (!state.sendStage || !state.room) return
  await state.sendStage({
    kind: 'stage-state',
    role: state.role,
    live: state.role === 'publisher',
    address: state.address,
    peerId: selfId,
    room: state.room,
    issuedAt: new Date().toISOString()
  }, targetPeers)
}

async function ensureMedia() {
  if (state.localStream) return state.localStream
  state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  if (els.localVideo) els.localVideo.srcObject = state.localStream
  updateUi()
  return state.localStream
}

function createPeerConnection(remotePeerId) {
  const existing = state.peerConnections.get(remotePeerId)
  if (existing) return existing

  const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] })
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) state.sendSignal?.({ kind: 'ice', to: remotePeerId, candidate }, [remotePeerId])
  }
  pc.ontrack = ({ streams }) => {
    const stream = streams?.[0]
    if (!stream) return
    state.remoteStreams.set(remotePeerId, stream)
    updateUi()
  }
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
      removeRemoteStream(remotePeerId)
      updateUi()
    }
  }

  state.peerConnections.set(remotePeerId, pc)
  return pc
}

function upsertPeer(peerId, patch = {}) {
  const prev = state.peers.get(peerId) || { peerId }
  const next = { ...prev, ...patch, peerId, lastSeenAt: Date.now() }
  state.peers.set(peerId, next)
  if (next.role === 'publisher') {
    state.stage.livePeers.set(peerId, next.address || next.displayName || peerId)
    if (!state.stage.publisherId) {
      state.stage.publisherId = peerId
      state.stage.publisherAddress = next.address || next.displayName || peerId
    }
  } else {
    state.stage.livePeers.delete(peerId)
    if (state.stage.publisherId === peerId) {
      const nextPublisher = state.stage.livePeers.entries().next().value
      state.stage.publisherId = nextPublisher?.[0] ?? null
      state.stage.publisherAddress = nextPublisher?.[1] ?? null
    }
  }
  updateUi()
  return next
}

function removePeer(peerId) {
  state.peers.delete(peerId)
  state.stage.livePeers.delete(peerId)
  state.stage.viewers.delete(peerId)
  if (state.stage.publisherId === peerId) {
    const nextPublisher = state.stage.livePeers.entries().next().value
    state.stage.publisherId = nextPublisher?.[0] ?? null
    state.stage.publisherAddress = nextPublisher?.[1] ?? null
  }
  closePeerConnection(peerId)
  updateUi()
}

async function initializeRoom() {
  if (!state.room || !state.address) return

  destroyRoom({ preserveRoom: true, silent: true })
  resetRoomState()

  const room = joinTrysteroRoom({ appId: APP_ID }, state.room)
  const [sendPresence, getPresence] = room.makeAction(PRESENCE_ACTION)
  const [sendChat, getChat] = room.makeAction(CHAT_ACTION)
  const [sendStage, getStage] = room.makeAction(STAGE_ACTION)
  const [sendSignal, getSignal] = room.makeAction(SIGNAL_ACTION)

  state.roomHandle = room
  state.sendPresence = sendPresence
  state.sendChat = sendChat
  state.sendStage = sendStage
  state.sendSignal = sendSignal

  room.onPeerJoin((peerId) => {
    upsertPeer(peerId)
    void publishPresence([peerId])
    void publishStage([peerId])
  })

  room.onPeerLeave((peerId) => {
    removePeer(peerId)
    log('Peer left', { peerId })
  })

  getPresence((payload, peerId) => {
    if (!payload || peerId === selfId) return
    if (payload.kind === 'leave') {
      removePeer(peerId)
      return
    }
    upsertPeer(peerId, {
      address: payload.address,
      walletMode: payload.walletMode,
      role: payload.role || 'audience',
      room: payload.room
    })
  })

  getChat((payload, peerId) => {
    if (!payload?.text) return
    log('Chat', { from: state.peers.get(peerId)?.address || peerId, text: payload.text })
  })

  getStage((payload, peerId) => {
    if (!payload || peerId === selfId) return
    upsertPeer(peerId, {
      role: payload.role || 'audience',
      address: payload.address || state.peers.get(peerId)?.address
    })
  })

  getSignal((payload, peerId) => {
    void handleSignal(peerId, payload)
  })

  await publishPresence()
  await publishStage()
  log('Joined room', { room: state.room })
  updateUi()
}

async function becomePublisher() {
  await ensureMedia()
  state.role = 'publisher'
  state.stage.publisherId = selfId
  state.stage.publisherAddress = state.address
  closeAllPeerConnections()
  await publishPresence()
  await publishStage()
  log('You are live')
  updateUi()
}

async function watchStage() {
  const livePeerIds = [...state.stage.livePeers.keys()].filter((peerId) => peerId !== selfId)
  if (livePeerIds.length === 0) return
  state.role = 'subscriber'
  closeAllPeerConnections()
  await publishPresence()
  await publishStage()
  for (const peerId of livePeerIds) {
    state.sendSignal?.({ kind: 'watch-request', to: peerId }, [peerId])
  }
  log('Requested stage stream', { from: livePeerIds })
  updateUi()
}

async function leaveStage() {
  const wasPublisher = state.role === 'publisher'
  state.role = 'audience'
  closeAllPeerConnections()

  if (state.localStream && !wasPublisher) {
    for (const track of state.localStream.getTracks()) track.stop()
    state.localStream = null
    if (els.localVideo) els.localVideo.srcObject = null
  }

  if (wasPublisher) {
    state.stage.livePeers.delete(selfId)
    const nextPublisher = state.stage.livePeers.entries().next().value
    state.stage.publisherId = nextPublisher?.[0] ?? null
    state.stage.publisherAddress = nextPublisher?.[1] ?? null
  }

  await publishPresence()
  await publishStage()
  updateUi()
}

async function handleSignal(senderId, payload = {}) {
  if (!payload || senderId === selfId) return
  if (payload.to && payload.to !== selfId) return

  if (payload.kind === 'watch-request' && state.role === 'publisher') {
    await ensureMedia()
    const pc = createPeerConnection(senderId)
    if (state.localStream && pc.getSenders().length === 0) {
      for (const track of state.localStream.getTracks()) pc.addTrack(track, state.localStream)
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    state.sendSignal?.({ kind: 'description', to: senderId, description: pc.localDescription }, [senderId])
    state.stage.viewers.add(senderId)
    updateUi()
    return
  }

  let pc = state.peerConnections.get(senderId)
  if (!pc) pc = createPeerConnection(senderId)

  if (payload.kind === 'description' && payload.description) {
    await pc.setRemoteDescription(payload.description)
    if (payload.description.type === 'offer') {
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      state.sendSignal?.({ kind: 'description', to: senderId, description: pc.localDescription }, [senderId])
    }
    return
  }

  if (payload.kind === 'ice' && payload.candidate) {
    try {
      await pc.addIceCandidate(payload.candidate)
    } catch (error) {
      log(`ICE failed: ${error.message}`)
    }
  }
}

function destroyRoom({ preserveRoom = false, silent = false } = {}) {
  if (state.roomHandle && state.sendPresence) {
    state.sendPresence(localPresence('leave')).catch(() => {})
  }

  try { state.roomHandle?.leave?.() } catch {}

  state.roomHandle = null
  state.sendPresence = null
  state.sendChat = null
  state.sendStage = null
  state.sendSignal = null

  closeAllPeerConnections()
  state.peers.clear()
  resetStageState()

  if (!preserveRoom) {
    state.room = null
    history.replaceState({}, '', location.pathname)
  }

  if (!silent) log('Left room')
  updateUi()
}

async function authenticate(address, signer, mode) {
  state.sessionId = crypto.randomUUID().slice(0, 8)
  state.signer = signer
  updateUi()
  showAppView()
  log('Identity ready', { address, walletMode: state.walletMode, mode })
  if (state.room) await joinRoom(state.room)
}

async function ensureRoomSignature(room) {
  if (state.walletMode !== 'Ethereum') return
  if (state.roomSignatures.has(room)) return
  if (!state.signer || !state.address) throw new Error('Wallet signer unavailable')
  const nonce = crypto.randomUUID().slice(0, 8)
  const message = `Plasmodium room join\nAddress: ${state.address}\nRoom: ${room}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`
  await state.signer(message)
  state.roomSignatures.add(room)
  log('Room signature complete', { room, address: state.address })
}

async function joinRoom(roomName) {
  const room = (roomName || state.room || makeRoomName()).trim()
  await ensureRoomSignature(room)
  state.room = room
  history.replaceState({}, '', `${location.pathname}?room=${encodeURIComponent(room)}`)
  await initializeRoom()
  updateUi()
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
    state.walletMode = 'Ethereum'

    await authenticate(
      address,
      (message) => window.ethereum.request({ method: 'personal_sign', params: [message, address] }),
      'ethereum'
    )

    els.walletHint.textContent = 'Wallet connected. Signature will be requested when you open a room.'
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
    await authenticate(state.address, null, 'anonymous')
    els.walletHint.textContent = 'Anonymous identity created. Open a room to enter.'
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

els.leaveButton.addEventListener('click', () => {
  destroyRoom()
})

els.goLiveButton.addEventListener('click', () => {
  void becomePublisher().catch((error) => log(`Go live failed: ${error.message}`))
})

els.watchStageButton.addEventListener('click', () => {
  void watchStage().catch((error) => log(`Watch failed: ${error.message}`))
})

els.leaveStageButton.addEventListener('click', () => {
  void leaveStage().catch((error) => log(`Leave stage failed: ${error.message}`))
})

if (els.switchIdentityButton) {
  els.switchIdentityButton.addEventListener('click', () => {
    destroyRoom({ silent: true })
    resetAuthSession()
    state.address = null
    state.walletMode = null
    state.anonymousWallet = null
    if (state.localStream) {
      for (const track of state.localStream.getTracks()) track.stop()
      state.localStream = null
      if (els.localVideo) els.localVideo.srcObject = null
    }
    history.replaceState({}, '', location.pathname)
    showLoginView()
    updateUi()
    log('Logged out')
  })
}

if (!window.ethereum && els.walletHint) {
  els.walletHint.textContent = 'No Ethereum wallet detected.'
  els.walletHint.classList.remove('hidden')
}

window.addEventListener('beforeunload', () => {
  if (state.roomHandle && state.sendPresence) {
    state.sendPresence(localPresence('leave')).catch(() => {})
  }
})

setLoginBusy(false)
showLoginView()
updateUi()
log('Plasmodium loaded (direct Trystero mode)')
