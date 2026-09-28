import { app, BrowserWindow, Menu, shell, session, ipcMain } from 'electron'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = process.env.ADI_MUSIC_URL || 'https://music.imreallyadi.space'
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1219911045926223914'

let mainWindow
let discordSocket
let discordBuffer = Buffer.alloc(0)
let discordReady = false
let pendingDiscordState
let discordReconnectTimer

const getDiscordPipe = () => {
	if (process.platform === 'win32') return '\\\\?\\pipe\\discord-ipc-0'
	const tmp = process.env.TMPDIR || process.env.XDG_RUNTIME_DIR || '/tmp'
	return path.join(tmp, 'discord-ipc-0')
}

const writeDiscordFrame = (opcode, payload) => {
	if (!discordSocket || !discordSocket.writable) return
	const body = Buffer.from(JSON.stringify(payload))
	const frame = Buffer.alloc(8 + body.length)
	frame.writeInt32LE(opcode, 0)
	frame.writeInt32LE(body.length, 4)
	body.copy(frame, 8)
	discordSocket.write(frame)
}

const scheduleDiscordReconnect = () => {
	if (discordReconnectTimer || !DISCORD_CLIENT_ID) return

	discordReconnectTimer = setTimeout(() => {
		discordReconnectTimer = undefined
		connectDiscord()
	}, 2000)
}

const connectDiscord = () => {
	if (!DISCORD_CLIENT_ID || discordSocket) return

	console.log('[Discord RPC] Connecting...')

	const socket = net.createConnection(getDiscordPipe())
	discordSocket = socket

	socket.on('connect', () => {
		console.log('[Discord RPC] IPC connected')
		discordReady = false
		writeDiscordFrame(0, {
			v: 1,
			client_id: DISCORD_CLIENT_ID,
		})
	})

	socket.on('data', (chunk) => {
		discordBuffer = Buffer.concat([discordBuffer, chunk])

		while (discordBuffer.length >= 8) {
			const length = discordBuffer.readInt32LE(4)
			if (discordBuffer.length < 8 + length) break

			const opcode = discordBuffer.readInt32LE(0)
			const payload = JSON.parse(
				discordBuffer.subarray(8, 8 + length).toString(),
			)
			discordBuffer = discordBuffer.subarray(8 + length)

			if (payload?.evt === 'ERROR') {
				console.error(
					'[Discord RPC] Error:',
					payload.data?.message || 'Unknown Discord RPC error',
				)
				continue
			}

			if (opcode === 1 && payload?.evt === 'READY') {
				console.log('[Discord RPC] READY')
				discordReady = true

				if (pendingDiscordState !== undefined) {
					const state = pendingDiscordState
					pendingDiscordState = undefined
					setDiscordPresence(state)
				}
			}
		}
	})

	socket.on('error', (error) => {
		discordReady = false
		console.warn('[Discord RPC] Connection error:', error.message)
	})

	socket.on('close', () => {
		discordReady = false
		discordSocket = undefined
		discordBuffer = Buffer.alloc(0)
		console.log('[Discord RPC] IPC disconnected')
		scheduleDiscordReconnect()
	})
}

const setDiscordPresence = (state) => {
	if (!DISCORD_CLIENT_ID) return

	pendingDiscordState = state

	if (!discordReady) {
		connectDiscord()
		return
	}

	pendingDiscordState = undefined

	const activity = state
		? {
				details: state.title,
				state: state.artist,
				assets: {
					large_image: state.artwork,
					large_text: state.album || state.title + ' • ' + state.artist,
				},
				timestamps:
					state.playing && state.duration > 0
						? {
								start: Date.now() - state.position * 1000,
								end: Date.now() + Math.max(0, state.duration - state.position) * 1000,
							}
						: undefined,
				buttons: state.url
					? [{ label: 'Open Adi Music', url: state.url }]
					: undefined,
			}
		: null

	console.log(
		'[Discord RPC] SET_ACTIVITY',
		state ? state.title : 'clear',
	)

	writeDiscordFrame(1, {
		cmd: 'SET_ACTIVITY',
		args: {
			pid: process.pid,
			activity,
		},
		nonce: crypto.randomUUID(),
	})
}

ipcMain.on('discord:set-presence', (_event, state) => {
	setDiscordPresence(state)
})

ipcMain.on('discord:clear-presence', () => {
	setDiscordPresence(undefined)
})

ipcMain.on('media:set-now-playing', () => {})

const createWindow = async () => {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 900,
		minHeight: 600,
		show: false,
		backgroundColor: '#ffffff',
		webPreferences: {
			preload: path.join(__dirname, 'preload.mjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	})

	mainWindow.once('ready-to-show', () => mainWindow.show())

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('https://')) {
			shell.openExternal(url)
		}
		return { action: 'deny' }
	})

	await mainWindow.loadURL(APP_URL)
}

app.whenReady().then(async () => {
	Menu.setApplicationMenu(null)
	await session.defaultSession.clearCache()
	await createWindow()
	connectDiscord()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		}
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})
