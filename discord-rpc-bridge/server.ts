import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Client } from '@xhayper/discord-rpc'

const PORT = Number(process.env.PORT ?? 6463)
const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const LARGE_IMAGE = process.env.DISCORD_LARGE_IMAGE_KEY
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

const rpc = new Client({ clientId: CLIENT_ID })
let connected = false
let reconnectTimer: NodeJS.Timeout | undefined

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

const connectDiscord = async (): Promise<void> => {
	if (connected) return

	try {
		await rpc.login()
		connected = true
		console.log('Connected to Discord.')
	} catch (error) {
		connected = false
		console.log('Discord is not available yet.')
		if (!reconnectTimer) {
			reconnectTimer = setTimeout(() => {
				reconnectTimer = undefined
				void connectDiscord()
			}, 5000)
		}
	}
}

rpc.on('ready', () => {
	connected = true
	console.log('Discord RPC ready.')
})

rpc.on('disconnected', () => {
	connected = false
	void connectDiscord()
})

rpc.on('error', () => {
	connected = false
	void connectDiscord()
})

const clearPresence = async () => {
	if (!connected) return
	try {
		await rpc.user?.setActivity({}) 
	} catch {
		connected = false
	}
}

const updatePresence = async (payload: {
	title: string
	artist: string
	album?: string
	playing: boolean
	position: number
	duration: number
}) => {
	if (!connected) await connectDiscord()
	if (!connected) return

	const duration = Number.isFinite(payload.duration) ? Math.max(0, payload.duration) : 0
	const position = Number.isFinite(payload.position)
		? Math.min(Math.max(0, payload.position), duration || Number.MAX_SAFE_INTEGER)
		: 0

	const activity: Record<string, unknown> = {
		details: payload.title.slice(0, 128),
		state: payload.artist.slice(0, 128),
		instance: true,
	}

	if (payload.album && payload.album !== '~\\0unknown') {
		activity.state = `${payload.artist} • ${payload.album}`.slice(0, 128)
	}

	if (LARGE_IMAGE) {
		activity.largeImageKey = LARGE_IMAGE
		activity.largeImageText = 'Adi Music'
	}

	if (duration > 0 && payload.playing) {
		const startTimestamp = Date.now() - position * 1000
		activity.startTimestamp = startTimestamp
		activity.endTimestamp = startTimestamp + duration * 1000
	}

	try {
		await rpc.user?.setActivity(activity)
	} catch {
		connected = false
		void connectDiscord()
	}
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
			writeJson(response, 200, { ok: true, connected }, origin)
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
	void connectDiscord()
})

const shutdown = async () => {
	server.close()
	try {
		await rpc.destroy()
	} catch {
		// Discord may already have closed the IPC socket.
	}
	process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
