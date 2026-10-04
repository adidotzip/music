import { app, BrowserWindow, Menu, shell, session, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import net from 'node:net'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = process.env.ADI_MUSIC_URL || 'https://music.imreallyadi.space'
const LIBRESPOT_BINARY = process.env.ADI_LIBRESPOT_BINARY || path.join(__dirname, '..', 'native', 'librespot-player', 'target', 'release', process.platform === 'win32' ? 'adi-librespot-player.exe' : 'adi-librespot-player')
let librespotProcess
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1219911045926223914'

let mainWindow
let discordSocket
let discordBuffer = Buffer.alloc(0)
let discordReady = false
let pendingDiscordState
let discordReconnectTimer
let discordPipeIndex = 0

const getDiscordPipes = () => {
\tif (process.platform === 'win32') {
\t\treturn Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`)
\t}

\tconst dirs = [
\t\tprocess.env.XDG_RUNTIME_DIR,
\t\tprocess.env.TMPDIR,
\t\tprocess.env.TMP,
\t\tprocess.env.TEMP,
\t\t'/tmp',
\t].filter(Boolean)

\treturn [...new Set(dirs)].flatMap((dir) =>
\t\tArray.from({ length: 10 }, (_, index) => path.join(dir, `discord-ipc-${index}`)),
\t)
}

const getNextDiscordPipe = () => {
\tconst pipes = getDiscordPipes()

\tfor (let offset = 0; offset < pipes.length; offset += 1) {
\t\tconst index = (discordPipeIndex + offset) % pipes.length
\t\tif (fs.existsSync(pipes[index])) {
\t\t\tdiscordPipeIndex = index
\t\t\treturn pipes[index]
\t\t}
\t}

\treturn pipes[0]
}

const writeDiscordFrame = (opcode, payload) => {
\tif (!discordSocket || !discordSocket.writable) return
\tconst body = Buffer.from(JSON.stringify(payload))
\tconst frame = Buffer.alloc(8 + body.length)
\tframe.writeInt32LE(opcode, 0)
\tframe.writeInt32LE(body.length, 4)
\tbody.copy(frame, 8)
\tdiscordSocket.write(frame)
}

const scheduleDiscordReconnect = () => {
\tif (discordReconnectTimer || !DISCORD_CLIENT_ID) return

\tdiscordReconnectTimer = setTimeout(() => {
\t\tdiscordReconnectTimer = undefined
\t\tdiscordPipeIndex = (discordPipeIndex + 1) % getDiscordPipes().length
\t\tconnectDiscord()
\t}, 1000)
}

const connectDiscord = () => {
\tif (!DISCORD_CLIENT_ID || discordSocket) return

\tconst pipe = getNextDiscordPipe()
\tconsole.log('[Discord RPC] Connecting to', pipe)

\tconst socket = net.createConnection(pipe)
\tdiscordSocket = socket

\tsocket.on('connect', () => {
\t\tconsole.log('[Discord RPC] IPC connected:', pipe)
\t\tdiscordReady = false
\t\twriteDiscordFrame(0, {
\t\t\tv: 1,
\t\t\tclient_id: DISCORD_CLIENT_ID,
\t\t})
\t})

\tsocket.on('data', (chunk) => {
\t\tdiscordBuffer = Buffer.concat([discordBuffer, chunk])

\t\twhile (discordBuffer.length >= 8) {
\t\t\tconst length = discordBuffer.readInt32LE(4)
\t\t\tif (discordBuffer.length < 8 + length) break

\t\t\tconst opcode = discordBuffer.readInt32LE(0)
\t\t\tconst payload = JSON.parse(
\t\t\t\tdiscordBuffer.subarray(8, 8 + length).toString(),
\t\t\t)
\t\t\tdiscordBuffer = discordBuffer.subarray(8 + length)

\t\t\tconsole.log(
\t\t\t\t'[Discord RPC] Response:',
\t\t\t\tJSON.stringify(
\t\t\t\t\t{
\t\t\t\t\t\topcode,
\t\t\t\t\t\tevt: payload?.evt,
\t\t\t\t\t\tcmd: payload?.cmd,
\t\t\t\t\t\tdata: payload?.data,
\t\t\t\t\t},
\t\t\t\t\tnull,
\t\t\t\t\t2,
\t\t\t\t),
\t\t\t)

\t\t\tif (payload?.evt === 'ERROR') {
\t\t\t\tconsole.error(
\t\t\t\t\t'[Discord RPC] ERROR:',
\t\t\t\t\tpayload.data?.code,
\t\t\t\t\tpayload.data?.message || 'Unknown Discord RPC error',
\t\t\t\t)
\t\t\t\tcontinue
\t\t\t}

\t\t\tif (opcode === 1 && payload?.evt === 'READY') {
\t\t\t\tconsole.log('[Discord RPC] READY')
\t\t\t\tdiscordReady = true

\t\t\t\tif (pendingDiscordState !== undefined) {
\t\t\t\t\tconst state = pendingDiscordState
\t\t\t\t\tpendingDiscordState = undefined
\t\t\t\t\tsetDiscordPresence(state)
\t\t\t\t}
\t\t\t}
\t\t}
\t})

\tsocket.on('error', (error) => {
\t\tdiscordReady = false
\t\tconsole.warn('[Discord RPC] Connection error:', error.message)
\t})

\tsocket.on('close', () => {
\t\tdiscordReady = false
\t\tdiscordSocket = undefined
\t\tdiscordBuffer = Buffer.alloc(0)
\t\tconsole.log('[Discord RPC] IPC disconnected')
\t\tscheduleDiscordReconnect()
\t})
}

const setDiscordPresence = (state) => {
\tif (!DISCORD_CLIENT_ID) return

\tpendingDiscordState = state

\tif (!discordReady) {
\t\tconnectDiscord()
\t\treturn
\t}

\tpendingDiscordState = undefined

\tlet activity = null

\tif (state) {
\t\tconst position = Number.isFinite(state.position) ? Math.max(0, state.position) : 0
\t\tconst duration = Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0
\t\tconst now = Math.floor(Date.now() / 1000)
\t\tconst artist = state.artist || 'Adi Music'
\t\tconst title = state.title || 'Listening to music'

\t\tactivity = {
\t\t\ttype: 2,
\t\t\tname: artist,
\t\t\tdetails: title,
\t\t\tstate: artist,
\t\t}

\t\tif (state.playing && duration > 0 && position < duration) {
\t\t\tactivity.timestamps = {
\t\t\t\tstart: now - Math.floor(position),
\t\t\t\tend: now + Math.ceil(duration - position),
\t\t\t}
\t\t}

\t\tconst artwork = typeof state.artwork === 'string' ? state.artwork.trim() : ''
\t\tif (artwork) {
\t\t\t// Discord's RPC large_image accepts a URL for external artwork.
\t\t\t// Use the exact public artwork URL supplied by the player so the
\t\t\t// Discord card and the Adi Music player show the same image.
\t\t\tactivity.assets = {
\t\t\t\tlarge_image: artwork,
\t\t\t\tlarge_text: title,
\t\t\t\tsmall_text: artist,
\t\t\t}
\t\t}

\t\tconst url = typeof state.url === 'string' ? state.url.trim() : ''
\t\tif (url && /^https:\/\//.test(url)) {
\t\t\tactivity.buttons = [
\t\t\t\t{
\t\t\t\t\tlabel: 'Open in Adi Music',
\t\t\t\t\turl,
\t\t\t\t},
\t\t\t]
\t\t}
\t}

\tconsole.log(
\t\t'[Discord RPC] SET_ACTIVITY:',
\t\tJSON.stringify(activity, null, 2),
\t)

\twriteDiscordFrame(1, {
\t\tcmd: 'SET_ACTIVITY',
\t\targs: {
\t\t\tpid: process.pid,
\t\t\tactivity,
\t\t},
\t\tnonce: crypto.randomUUID(),
\t})
}

ipcMain.on('discord:set-presence', (_event, state) => {
\tsetDiscordPresence(state)
})

ipcMain.on('discord:clear-presence', () => {
\tsetDiscordPresence(undefined)
})

ipcMain.on('media:set-now-playing', () => {})

ipcMain.handle('spotify:play', async (_event, { accessToken, trackId }) => {
    if (typeof accessToken !== 'string' || !accessToken || typeof trackId !== 'string' || !trackId) {
        throw new Error('Spotify access token and track ID are required')
    }

    if (librespotProcess) {
        librespotProcess.kill()
        librespotProcess = undefined
    }

    const { spawn } = await import('node:child_process')
    librespotProcess = spawn(LIBRESPOT_BINARY, [accessToken, trackId], {
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    librespotProcess.stdout?.on('data', (chunk) => console.log('[librespot]', chunk.toString().trim()))
    librespotProcess.stderr?.on('data', (chunk) => console.warn('[librespot]', chunk.toString().trim()))
    librespotProcess.on('exit', () => {
        librespotProcess = undefined
    })

    return { started: true }
})

ipcMain.handle('spotify:stop', () => {
    if (librespotProcess) {
        librespotProcess.kill()
        librespotProcess = undefined
    }
    return { stopped: true }
})

const createWindow = async () => {
\tmainWindow = new BrowserWindow({
\t\twidth: 1280,
\t\theight: 820,
\t\tminWidth: 900,
\t\tminHeight: 600,
\t\tshow: false,
\t\tbackgroundColor: '#ffffff',
\t\twebPreferences: {
\t\t\tpreload: path.join(__dirname, 'preload.cjs'),
\t\t\tcontextIsolation: true,
\t\t\tnodeIntegration: false,
\t\t\tsandbox: true,
\t\t},
\t})

\tmainWindow.once('ready-to-show', () => mainWindow.show())

\tmainWindow.webContents.setWindowOpenHandler(({ url }) => {
\t\tif (url.startsWith('https://')) {
\t\t\tshell.openExternal(url)
\t\t}
\t\treturn { action: 'deny' }
\t})

\tawait mainWindow.loadURL(APP_URL)
}

app.whenReady().then(async () => {
\tMenu.setApplicationMenu(null)
\tawait session.defaultSession.clearCache()
\tawait createWindow()
\tconnectDiscord()

\tapp.on('activate', () => {
\t\tif (BrowserWindow.getAllWindows().length === 0) {
\t\t\tcreateWindow()
\t\t}
\t})
})

app.on('before-quit', () => {
	if (librespotProcess) {
		librespotProcess.kill()
		librespotProcess = undefined
	}
})

app.on('window-all-closed', () => {
\tif (process.platform !== 'darwin') {
\t\tapp.quit()
\t}
})
