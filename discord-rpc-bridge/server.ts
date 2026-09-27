import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 6463)
const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ?? 'http://127.0.0.1:6463/oauth/callback'

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

if (!CLIENT_SECRET) {
	console.error('Missing DISCORD_CLIENT_SECRET.')
	console.error('Discord RPC now requires authentication. Set the application Client Secret before starting the bridge.')
	process.exit(1)
}

type RpcPayload = {
	cmd: string
	nonce?: string
	args?: Record<string, unknown>
	data?: Record<string, unknown>
	evt?: string | null
}

type PendingCommand = {
	resolve: (payload: RpcPayload) => void
	reject: (error: Error) => void
	timer: NodeJS.Timeout
}

const getRpcToken = async (): Promise<string> => {
	const body = new URLSearchParams({
		client_id: CLIENT_ID!,
		client_secret: CLIENT_SECRET!,
	})

	const response = await fetch('https://discord.com/api/oauth2/token/rpc', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body,
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`Discord RPC token request failed (${response.status}): ${message}`)
	}

	const data = (await response.json()) as { rpc_token?: string }
	if (!data.rpc_token) throw new Error('Discord did not return an RPC token.')
	return data.rpc_token
}

const exchangeAuthorizationCode = async (code: string): Promise<string> => {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		redirect_uri: REDIRECT_URI,
	})

	const basic = Buffer.from(`${CLIENT_ID!}:${CLIENT_SECRET!}`).toString('base64')
	const response = await fetch('https://discord.com/api/oauth2/token', {
		method: 'POST',
		headers: {
		'content-type': 'application/x-www-form-urlencoded',
		authorization: `Basic ${basic}`,
		},
		body,
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`Discord authorization code exchange failed (${response.status}): ${message}`)
	}

	const data = (await response.json()) as { access_token?: string }
	if (!data.access_token) throw new Error('Discord did not return an access token.')
	return data.access_token
}

class DiscordIpc {
	#socket: Socket | null = null
	#buffer = Buffer.alloc(0)
	#ready = false
	#authenticated = false
	#connecting: Promise<boolean> | null = null
	#pending = new Map<string, PendingCommand>()

	get connected(): boolean {
		return this.#authenticated && this.#socket !== null && !this.#socket.destroyed
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
				console.log(`Connected and authenticated with Discord IPC: ${pipe}`)
				return true
			}
		}

		return false
	}

	async #tryPipe(pipe: string): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = connect(pipe)
			let settled = false
			let handshakeTimer: NodeJS.Timeout | undefined

			const finish = (success: boolean) => {
				if (settled) return
				settled = true
				if (handshakeTimer) clearTimeout(handshakeTimer)
				if (!success) {
					this.#rejectPending(new Error('Discord IPC connection closed.'))
					socket.destroy()
					resolve(false)
				}
			}

			socket.setTimeout(3000)
			socket.on('connect', () => {
				this.#socket = socket
				this.#buffer = Buffer.alloc(0)
				this.#ready = false
				this.#authenticated = false

				this.#attachSocketHandlers(socket, () => {
					this.#ready = true
					void this.#authenticate()
						.then(() => {
							this.#authenticated = true
							finish(true)
							resolve(true)
						})
						.catch((error) => {
							console.error(`Discord RPC authentication failed: ${error instanceof Error ? error.message : error}`)
							finish(false)
						})
				})

				// Discord requires the handshake to be sent after the IPC socket connects.
				this.#sendFrame(0, {
					v: 1,
					client_id: CLIENT_ID,
				})
				handshakeTimer = setTimeout(() => finish(false), 5000)
			})

			socket.on('timeout', () => finish(false))
			socket.on('error', (error) => {
				if (!settled) console.error(`Discord IPC error: ${error.message}`)
				finish(false)
			})
			socket.on('close', () => {
				if (this.#socket === socket) {
					this.#socket = null
					this.#ready = false
					this.#authenticated = false
				}
				this.#rejectPending(new Error('Discord IPC connection closed.'))
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
					if (opcode !== 1) continue

					if (payload.evt === 'READY') {
						onReady()
						continue
					}

					if (payload.nonce) {
						const pending = this.#pending.get(payload.nonce)
						if (pending) {
							clearTimeout(pending.timer)
							this.#pending.delete(payload.nonce)

							if (payload.evt === 'ERROR') {
								const message = typeof payload.data?.message === 'string'
									? payload.data.message
									: JSON.stringify(payload.data)
								pending.reject(new Error(message))
							} else {
								pending.resolve(payload)
							}
						}
					}
				} catch {
					// Discord can close the connection on malformed frames.
				}
			}
		})
	}

	async #authenticate(): Promise<void> {
		const rpcToken = await getRpcToken()

		const authorize = await this.#sendCommand('AUTHORIZE', {
			client_id: CLIENT_ID,
			scopes: ['rpc'],
			rpc_token: rpcToken,
		})

		const code = typeof authorize.data?.code === 'string' ? authorize.data.code : undefined
		if (!code) throw new Error('Discord AUTHORIZE did not return an authorization code.')

		const accessToken = await exchangeAuthorizationCode(code)
		await this.#sendCommand('AUTHENTICATE', { access_token: accessToken })
	}

	#sendCommand(cmd: string, args: Record<string, unknown>): Promise<RpcPayload> {
		const nonce = randomUUID()

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pending.delete(nonce)
				reject(new Error(`Discord RPC command timed out: ${cmd}`))
			}, 8000)

			this.#pending.set(nonce, { resolve, reject, timer })
			this.#sendFrame(1, {
				cmd,
				nonce,
				args,
			})
		})
	}

	#rejectPending(error: Error): void {
		for (const [nonce, pending] of this.#pending) {
			clearTimeout(pending.timer)
			pending.reject(error)
			this.#pending.delete(nonce)
		}
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
		if (!this.connected) return
		void this.#sendCommand('SET_ACTIVITY', {
			pid: process.pid,
			activity,
		}).catch((error) => {
			console.error(`Discord SET_ACTIVITY failed: ${error instanceof Error ? error.message : error}`)
		})
	}

	clearActivity(): void {
		if (!this.connected) return
		void this.#sendCommand('SET_ACTIVITY', {
			pid: process.pid,
			activity: null,
		}).catch((error) => {
			console.error(`Discord CLEAR_ACTIVITY failed: ${error instanceof Error ? error.message : error}`)
		})
	}

	destroy(): void {
		this.#rejectPending(new Error('Discord bridge shutting down.'))
		this.#ready = false
		this.#authenticated = false
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
			writeJson(response, 200, { ok: true, connected: discord.connected }, origin)
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
