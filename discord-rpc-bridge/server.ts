import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 6463)
const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const ORIGINS = new Set([
	'https://music.imreallyadi.space',
	'http://localhost:5173',
	'http://127.0.0.1:5173',
])

if (!CLIENT_ID) {
	console.error('Missing DISCORD_CLIENT_ID.')
	console.error('Create a Discord application and set DISCORD_CLIENT_ID before starting the bridge.')
	process.exit(1)
}

type RpcPayload = {
	cmd: string
	nonce?: string
	args?: Record<string, unknown>
	data?: Record<string, unknown>
	evt?: string | null
}

class DiscordIpc {
	#socket: Socket | null = null
	#buffer = Buffer.alloc(0)
	#ready = false
	#connecting: Promise<boolean> | null = null

	get connected(): boolean {
		return this.#ready && this.#socket !== null && !this.#socket.destroyed
	}

	async connect(): Promise<boolean> {
		if (this.connected) return true
		if (this.#connecting) return this.#connecting

		this.#connecting = this.#connectInternal().finally(() => {
			this.#connecting = null
		})

		return this.#connecting
	}

	async #connectInternal(): Promise<boolean> {
		for (const pipe of getPipeCandidates()) {
			const connected = await this.#tryPipe(pipe)
			if (connected) {
				console.log(`Connected to Discord IPC: ${pipe}`)
				return true
			}
		}

		return false
	}

	#tryPipe(pipe: string): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = connect(pipe)
			let settled = false
			let handshakeTimer: NodeJS.Timeout | undefined

			const finish = (success: boolean) => {
				if (settled) return
				settled = true
				if (handshakeTimer) clearTimeout(handshakeTimer)

				if (!success) {
					socket.destroy()
					resolve(false)
				}
			}

			socket.setTimeout(1500)

			socket.on('connect', () => {
				this.#socket = socket
				this.#buffer = Buffer.alloc(0)
				this.#ready = false
				this.#attachSocketHandlers(socket, () => {
					this.#ready = true
					finish(true)
					resolve(true)
				})
				this.#sendFrame(0, {
					v: 1,
					client_id: CLIENT_ID,
				})
				handshakeTimer = setTimeout(() => finish(false), 1500)
			})

			socket.on('timeout', () => finish(false))
			socket.on('error', () => finish(false))
			socket.on('close', () => {
				if (this.#socket === socket) {
					this.#socket = null
					this.#ready = false
				}
				if (!settled) finish(false)
			})
		})
	}

	#attachSocketHandlers(socket: Socket, onReady: () => void): void {
		socket.on('data', (chunk) => {
			this.#buffer = Buffer.concat([this.#buffer, chunk])

			while (this.#buffer.length >= 8) {
				const opcode = this.#buffer.readUInt32LE(0)
				const length = this.#buffer.readUInt32LE(4)
				if (this.#buffer.length < 8 + length) break

				const body = this.#buffer.subarray(8, 8 + length).toString('utf8')
				this.#buffer = this.#buffer.subarray(8 + length)

				try {
					const payload = JSON.parse(body) as RpcPayload
					if (opcode === 1 && payload.evt === 'READY') {
						onReady()
					}
				} catch {
					// Discord can close the connection on malformed frames.
				}
			}
		})

		socket.on('close', () => {
			if (this.#socket === socket) {
				this.#socket = null
				this.#ready = false
			}
		})
	}

	#sendFrame(opcode: number, payload: Record<string, unknown>): void {
		if (!this.#socket || this.#socket.destroyed) return

		const body = Buffer.from(JSON.stringify(payload), 'utf8')
		const frame = Buffer.allocUnsafe(8 + body.length)
		frame.writeUInt32LE(opcode, 0)
		frame.writeUInt32LE(body.length, 4)
		body.copy(frame, 8)
		this.#socket.write(frame)
	}

	setActivity(activity: Record<string, unknown>): void {
		this.#sendFrame(1, {
			cmd: 'SET_ACTIVITY',
			nonce: randomUUID(),
			args: {
				pid: process.pid,
				activity,
			},
		})
	}

	clearActivity(): void {
		this.#sendFrame(1, {
			cmd: 'SET_ACTIVITY',
			nonce: randomUUID(),
			args: {
				pid: process.pid,
				activity: null,
			},
		})
	}

	destroy(): void {
		this.#ready = false
		this.#socket?.destroy()
		this.#socket = null
	}
}

const getPipeCandidates = (): string[] => {
	if (process.platform === 'win32') {
		return Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`)
	}

	const directories = [
		process.env.XDG_RUNTIME_DIR,
		process.env.TMPDIR,
		process.env.TMP,
		process.env.TEMP,
		tmpdir(),
		'/tmp',
	].filter((value): value is string => Boolean(value))

	return [...new Set(directories)].flatMap((directory) =>
		Array.from({ length: 10 }, (_, index) => join(directory, `discord-ipc-${index}`)),
	)
}

const discord = new DiscordIpc()
let reconnectTimer: NodeJS.Timeout | undefined

const scheduleReconnect = () => {
	if (reconnectTimer) return
	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined
		void ensureDiscord()
	}, 5000)
}

const ensureDiscord = async (): Promise<boolean> => {
	const connected = await discord.connect()
	if (!connected) scheduleReconnect()
	return connected
}

const writeJson = (response: ServerResponse, status: number, body: unknown, origin?: string) => {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'access-control-allow-origin': origin ?? 'null',
		'access-control-allow-methods': 'POST, OPTIONS',
		'access-control-allow-headers': 'content-type',
		'access-control-allow-private-network': 'true',
		'cache-control': 'no-store',
	})
	response.end(JSON.stringify(body))
}

const allowedOrigin = (request: IncomingMessage): string | undefined => {
	const origin = request.headers.origin
	return origin && ORIGINS.has(origin) ? origin : undefined
}

const readBody = async (request: IncomingMessage): Promise<unknown> => {
	let body = ''
	for await (const chunk of request) {
		body += chunk
		if (body.length > 32_000) throw new Error('Request body too large')
	}
	return JSON.parse(body || '{}')
}

const updatePresence = async (payload: {
	title: string
	artist: string
	album?: string
	playing: boolean
	position: number
	duration: number
}) => {
	if (!(await ensureDiscord())) return

	const duration = Number.isFinite(payload.duration) ? Math.max(0, payload.duration) : 0
	const position = Number.isFinite(payload.position)
		? Math.min(Math.max(0, payload.position), duration || Number.MAX_SAFE_INTEGER)
		: 0

	const activity: Record<string, unknown> = {
		type: 2,
		details: payload.title.slice(0, 128),
		state: payload.artist.slice(0, 128),
		instance: true,
		buttons: [{ label: 'Open Adi Music', url: 'https://music.imreallyadi.space' }],
	}

	if (payload.album && payload.album !== '~\\0unknown') {
		activity.state = `${payload.artist} • ${payload.album}`.slice(0, 128)
	}

	if (duration > 0 && payload.playing) {
		const startTimestamp = Math.floor(Date.now() / 1000 - position)
		activity.timestamps = {
			start: startTimestamp,
			end: startTimestamp + Math.floor(duration),
		}
	}

	discord.setActivity(activity)
}

const clearPresence = async () => {
	if (await ensureDiscord()) discord.clearActivity()
}

const server = createServer(async (request, response) => {
	const origin = allowedOrigin(request)

	if (request.method === 'OPTIONS') {
		if (!origin) {
			response.writeHead(403)
			response.end()
			return
		}
		writeJson(response, 204, {}, origin)
		return
	}

	if (!origin || request.method !== 'POST') {
		writeJson(response, 403, { error: 'Forbidden' }, origin)
		return
	}

	try {
		if (request.url === '/v1/presence') {
			const payload = await readBody(request)
			await updatePresence(payload as Parameters<typeof updatePresence>[0])
			writeJson(response, 200, { ok: true, connected: discord.connected }, origin)
			return
		}

		if (request.url === '/v1/presence/clear') {
			await clearPresence()
			writeJson(response, 200, { ok: true }, origin)
			return
		}

		writeJson(response, 404, { error: 'Not found' }, origin)
	} catch (error) {
		console.error(error)
		writeJson(response, 400, { error: 'Invalid request' }, origin)
	}
})

server.listen(PORT, '127.0.0.1', () => {
	console.log(`Adi Music Discord RPC bridge listening on http://127.0.0.1:${PORT}`)
	void ensureDiscord()
})

const shutdown = () => {
	server.close()
	discord.destroy()
	process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
