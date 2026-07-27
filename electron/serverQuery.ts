/**
 * Consulta o servidor de Valheim direto (protocolo Steam A2S, UDP) em vez de depender
 * de terceiros como o BattleMetrics — status e jogadores online saem em tempo real.
 *
 * O servidor de Valheim expõe o A2S na porta de consulta = porta do jogo + 1
 * (padrão: jogo 2456, consulta 2457). Como o admin normalmente cadastra o IP com a
 * porta do jogo, tentamos porta+1 primeiro e caímos na própria porta como fallback.
 */
import dgram from 'dgram'

export interface ServerStatus {
  online: boolean
  players: number
  maxPlayers: number
  /** Nome publicado pelo servidor (o mesmo que aparece na lista do jogo). */
  name?: string
  /** Versão do binário do servidor via A2S (o Valheim manda 1.0.0.0 fixo aqui). */
  version?: string
  /** Tags do servidor, ex: "g=0.221.12-ServerCharacters,n=36,m=". */
  keywords?: string
  /** Versão do jogo extraída das tags (o `g=`) — é a que interessa pro jogador. */
  gameVersion?: string
  /** Porta de consulta que respondeu. */
  queryPort?: number
  /** Tempo de resposta em ms. */
  ping?: number
  error?: string
}

const A2S_INFO_PAYLOAD = Buffer.from('Source Engine Query\0', 'ascii')
const HEADER_SIMPLE = 0xffffffff
const RESP_INFO = 0x49       // 'I' — A2S_INFO response
const RESP_CHALLENGE = 0x41  // 'A' — servidor pediu challenge, precisa reenviar

function buildInfoRequest(challenge?: Buffer): Buffer {
  const base = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), A2S_INFO_PAYLOAD])
  return challenge && challenge.length ? Buffer.concat([base, challenge]) : base
}

/** Leitor sequencial dos campos do pacote A2S. */
class PacketReader {
  private offset = 0
  constructor(private readonly buf: Buffer) {}

  byte(): number {
    if (this.offset + 1 > this.buf.length) throw new Error('pacote truncado')
    return this.buf[this.offset++]
  }

  short(): number {
    if (this.offset + 2 > this.buf.length) throw new Error('pacote truncado')
    const v = this.buf.readUInt16LE(this.offset)
    this.offset += 2
    return v
  }

  /** String terminada em NUL (o servidor manda UTF-8). */
  string(): string {
    const end = this.buf.indexOf(0x00, this.offset)
    if (end === -1) throw new Error('string sem terminador')
    const s = this.buf.toString('utf8', this.offset, end)
    this.offset = end + 1
    return s
  }

  skip(n: number) {
    this.offset += n
  }

  get remaining(): number {
    return this.buf.length - this.offset
  }
}

/**
 * Envia o A2S_INFO e devolve o pacote de resposta, tratando o challenge
 * (servidores modernos respondem 'A' + 4 bytes antes de liberar o 'I').
 */
function sendInfoRequest(host: string, port: number, timeoutMs: number): Promise<{ packet: Buffer; ping: number }> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    const startedAt = Date.now()
    let challengeRetries = 0
    let settled = false

    const finish = (err: Error | null, packet?: Buffer) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.close() } catch { /* já fechado */ }
      if (err) reject(err)
      else resolve({ packet: packet!, ping: Date.now() - startedAt })
    }

    const timer = setTimeout(() => finish(new Error('timeout ao consultar o servidor')), timeoutMs)

    const send = (challenge?: Buffer) => {
      socket.send(buildInfoRequest(challenge), port, host, err => {
        if (err) finish(err)
      })
    }

    socket.on('error', err => finish(err))

    socket.on('message', msg => {
      if (msg.length < 5) return
      // Respostas particionadas (0xFFFFFFFE) não acontecem no A2S_INFO do Valheim.
      if (msg.readUInt32LE(0) !== HEADER_SIMPLE) {
        finish(new Error('resposta em formato não suportado'))
        return
      }
      const type = msg[4]
      if (type === RESP_CHALLENGE) {
        if (challengeRetries++ >= 2) {
          finish(new Error('servidor ficou pedindo challenge'))
          return
        }
        send(msg.subarray(5, 9))
        return
      }
      if (type === RESP_INFO) {
        finish(null, msg)
        return
      }
      finish(new Error(`tipo de resposta inesperado: 0x${type.toString(16)}`))
    })

    send()
  })
}

function parseInfo(packet: Buffer): Omit<ServerStatus, 'online' | 'queryPort' | 'ping'> {
  const r = new PacketReader(packet)
  r.skip(4)   // header 0xFFFFFFFF
  r.byte()    // 'I'
  r.byte()    // versão do protocolo
  const name = r.string()
  r.string()  // map
  r.string()  // folder
  r.string()  // game
  r.short()   // appid
  const players = r.byte()
  const maxPlayers = r.byte()
  r.byte()    // bots
  r.byte()    // server type
  r.byte()    // environment
  r.byte()    // visibility
  r.byte()    // VAC
  const version = r.string()

  let keywords: string | undefined
  if (r.remaining > 0) {
    const edf = r.byte()
    if (edf & 0x80) r.short()      // porta do jogo
    if (edf & 0x10) r.skip(8)      // steamid
    if (edf & 0x40) { r.short(); r.string() } // spectator
    if (edf & 0x20) keywords = r.string()
    // 0x01 (gameid) fica no fim, não precisamos
  }

  return { name, players, maxPlayers, version, keywords, gameVersion: parseGameVersion(keywords) }
}

/**
 * A versão real do jogo vem nas tags como `g=<versão>` (ex: "g=0.221.12-ServerCharacters").
 * O campo `version` do A2S é sempre 1.0.0.0 no Valheim, então é esta que mostramos.
 */
function parseGameVersion(keywords?: string): string | undefined {
  if (!keywords) return undefined
  for (const tag of keywords.split(',')) {
    const [key, ...rest] = tag.split('=')
    if (key.trim() === 'g') {
      const value = rest.join('=').trim()
      if (value) return value
    }
  }
  return undefined
}

/** Separa "host:porta" (porta opcional, padrão 2456 do Valheim). */
export function parseServerAddress(address: string): { host: string; port: number } | null {
  const trimmed = (address || '').trim().replace(/^\w+:\/\//, '')
  if (!trimmed) return null
  const match = /^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/.exec(trimmed)
  if (!match) return null
  const host = match[1]
  if (!host || /\s/.test(host)) return null
  const port = match[2] ? Number(match[2]) : 2456
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return { host, port }
}

/**
 * Consulta o servidor. `port` é a porta do jogo (ex: 2456); tentamos a porta de
 * consulta (porta+1) e, se não responder, a própria porta — cobre quem cadastrou
 * o endereço já com a porta de consulta.
 */
export async function queryServerStatus(
  host: string,
  port: number,
  timeoutMs = 4000,
): Promise<ServerStatus> {
  const candidates = port + 1 <= 65535 ? [port + 1, port] : [port]
  let lastError = 'servidor não respondeu'

  for (const queryPort of candidates) {
    try {
      const { packet, ping } = await sendInfoRequest(host, queryPort, timeoutMs)
      const info = parseInfo(packet)
      return { online: true, queryPort, ping, ...info }
    } catch (err: any) {
      lastError = err?.message || String(err)
    }
  }

  return { online: false, players: 0, maxPlayers: 0, error: lastError }
}
