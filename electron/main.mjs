import { app, BrowserWindow, Menu, shell, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = process.env.ADI_MUSIC_URL || 'https://music.imreallyadi.space'

let mainWindow

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
		if (url.startsWith('https://')) shell.openExternal(url)
		return { action: 'deny' }
	})

	await mainWindow.loadURL(APP_URL)
}

app.whenReady().then(async () => {
	Menu.setApplicationMenu(null)
	await session.defaultSession.clearCache()
	await createWindow()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
