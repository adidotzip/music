export interface DiscordPresencePayload {
	title: string
	artist: string
	album?: string
	playing: boolean
	position: number
	duration: number
}

const APPLICATION_ID = '1219911045926223914'

let started = false
let startPromise: Promise<boolean> | null = null
let lastPayload: string | null = null

const isTauriDesktop = (): boolean =>
	typeof window !== 'undefined' &&
	'__TAURI_INTERNALS__' in window &&
	!('ontouchstart' in window)

const loadPlugin = async () => {
	if (!isTauriDesktop()) return null
	return import('tauri-plugin-drpc')
}

const ensureStarted = async (): Promise<boolean> => {
	if (started) return true
	if (startPromise) return startPromise

	startPromise = (async () => {
		try {
			const plugin = await loadPlugin()
			if (!plugin) return false
			await plugin.start(APPLICATION_ID)
			started = true
			return true
		} catch (error) {
			console.warn('Discord RPC unavailable:', error)
			return false
		} finally {
			startPromise = null
		}
	})()

	return startPromise
}

export const updateDiscordPresence = (payload: DiscordPresencePayload): void => {
	if (!payload.playing) {
		clearDiscordPresence()
		return
	}

	const normalized = JSON.stringify({
		title: payload.title,
		artist: payload.artist,
		album: payload.album ?? '',
		playing: payload.playing,
		position: Math.floor(Math.max(0, payload.position) / 5) * 5,
		duration: Math.max(0, Math.floor(payload.duration)),
	})

	if (normalized === lastPayload) return
	lastPayload = normalized

	void (async () => {
		try {
			const plugin = await loadPlugin()
			if (!plugin || !(await ensureStarted())) return

			const { Activity } = plugin
			let activity = new Activity()
				.setDetails(payload.title.slice(0, 128))
				.setState(payload.artist.slice(0, 128))

			if (payload.album) {
				activity = activity.setState(
					`${payload.artist} • ${payload.album}`.slice(0, 128),
				)
			}

			await plugin.setActivity(activity)
		} catch (error) {
			console.warn('Discord RPC update failed:', error)
		}
	})()
}

export const clearDiscordPresence = (): void => {
	lastPayload = null
	if (!started) return

	void (async () => {
		try {
			const plugin = await loadPlugin()
			if (plugin) await plugin.clearActivity()
		} catch (error) {
			console.warn('Discord RPC clear failed:', error)
		}
	})()
}
