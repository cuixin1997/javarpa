import { Client, type StompSubscription } from '@stomp/stompjs'

let client: Client | null = null

interface PendingSub {
  destination: string
  callback: (body: any) => void
  active: boolean
  /** 补订后的真实订阅；client 被替换或整体断开时置空，避免退订打到已停用的连接 */
  raw?: StompSubscription
}

// 连接未就绪时的待订阅请求，连接（含每次重连）成功后统一补订
let pendingSubs: PendingSub[] = []
// 已在当前 client 上建立真实订阅的条目
const liveSubs = new Set<PendingSub>()

function wrapCallback(callback: (body: any) => void) {
  return (msg: any) => {
    try {
      callback(JSON.parse(msg.body))
    } catch {
      callback(msg.body)
    }
  }
}

/** 退订：条目可能还在排队、也可能已补订成真实订阅，两种都要能彻底拆掉 */
function teardown(p: PendingSub) {
  p.active = false
  pendingSubs = pendingSubs.filter(x => x !== p)
  liveSubs.delete(p)
  const raw = p.raw
  p.raw = undefined
  raw?.unsubscribe()
}

function doSubscribe(p: PendingSub): StompSubscription {
  p.raw = client!.subscribe(p.destination, wrapCallback(p.callback))
  liveSubs.add(p)
  return { id: p.raw.id, unsubscribe: () => teardown(p) }
}

function flushPending() {
  const stillPending: PendingSub[] = []
  for (const p of pendingSubs) {
    if (!p.active) continue
    if (client?.connected) {
      doSubscribe(p)
    } else {
      stillPending.push(p)
    }
  }
  pendingSubs = stillPending
}

let lastErrorAt = 0
// 连接建立后需要触发的回调（复用正在连接的 client 时排队）
let connectCallbacks: (() => void)[] = []

/**
 * 确保全局连接可用。连接的开关由布局层（AdminLayout）独占：
 * 路由切换时新页面的 setup 早于旧页面的 onUnmounted，页面各自 disconnect
 * 会把新页面刚建立的连接掐掉。页面只需 subscribe / unsubscribe。
 */
export function connectStomp(onConnect?: () => void) {
  if (client?.connected) {
    onConnect?.()
    return
  }
  // 正在连接或自动重连中：复用同一个 client，回调排队等连上后统一触发。
  // 每次都新建 client 会造成连接抖动，还要把旧连接上的订阅重新排队补订
  if (onConnect) connectCallbacks.push(onConnect)
  if (client?.active) return

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  if (client) {
    // 走到这里说明 client 已被 deactivate：作废旧连接上的真实句柄（再退订会抛「Not connected」），
    // 并把活跃订阅重新入队，等新连接建立后自动补订
    for (const p of liveSubs) {
      p.raw = undefined
      if (p.active) pendingSubs.push(p)
    }
    liveSubs.clear()
    client.deactivate()
  }
  client = new Client({
    brokerURL: `${proto}://${location.host}/ws/admin`,
    // token 走 CONNECT 帧头而非 URL query，避免进入访问日志/浏览器历史；
    // 每次连接/重连前重读 token，改密或重登后不再拿旧 token 空转
    beforeConnect: () => {
      const token = localStorage.getItem('token') || ''
      if (client) client.connectHeaders = { Authorization: `Bearer ${token}` }
    },
    reconnectDelay: 5000,
    onConnect: () => {
      flushPending()
      const cbs = connectCallbacks
      connectCallbacks = []
      for (const cb of cbs) cb()
    },
    onStompError: frame => {
      // 重连风暴下最多每 60s 提示一次，避免弹窗轰炸
      const now = Date.now()
      const msg = frame.headers['message'] || '连接被拒绝'
      if (now - lastErrorAt > 60_000) {
        lastErrorAt = now
        console.warn('stomp error:', msg)
      }
    },
    onWebSocketClose: () => {
      // 断开后由 stompjs 自动重连，重连成功会补订 pending 订阅
    }
  })
  client.activate()
}

/**
 * 订阅实时消息。连接未就绪时自动排队，连接成功（含重连）后补订；
 * 返回的句柄在排队期间与补订之后都可正常 unsubscribe。
 */
export function subscribe(destination: string, callback: (body: any) => void): StompSubscription {
  const p: PendingSub = { destination, callback, active: true }
  if (client && client.connected) return doSubscribe(p)
  pendingSubs.push(p)
  return { id: 'pending', unsubscribe: () => teardown(p) }
}

export function disconnectStomp() {
  pendingSubs = []
  connectCallbacks = []
  // 连接整体拆除，真实订阅随之失效：只作废句柄，不再向已停用的 client 发退订帧
  for (const p of liveSubs) p.raw = undefined
  liveSubs.clear()
  if (client) {
    client.deactivate()
    client = null
  }
}
