export interface DiscordPresencePayload {
	title: string
	artist: string
	album?: string
	artwork?: string
	playing: boolean
	position: number
	duration: number
	url?: string
}

export interface AdiMusicRpcState {
	playing: boolean
	title: string
	artist: string
	album?: string
	artwork?: string
	position: number
	duration: number
	url: string
}

declare global {
	interface Window {
		__ADI_MUSIC_RPC__?: AdiMusicRpcState
		adiNative?: {
			platform: string
			isDesktop: boolean
			discord: {
				setPresence: (presence: AdiMusicRpcState) => void
				clearPresence: () => void
			}
			media: {
				setNowPlaying: (metadata: AdiMusicRpcState) => void
			}
		}
	}
}

const SITE_ORIGIN = 'https://music.imreallyadi.space'

const artworkCache = new Map<string, { url: string | undefined; expiresAt: number }>()
const artworkPending = new Map<string, Promise<string | undefined>>()

const isPublicArtworkUrl = (value: string | undefined): value is string =>
	!!value && /^https?:\/\//i.test(value)

const resolveRemoteArtwork = async (
	remoteId: number | string | undefined,
	title: string,
	artist: string,
): Promise<string | undefined> => {
	if (remoteId === undefined || remoteId === null || String(remoteId).trim() === '') return undefined

	const key = String(remoteId)
	const cached = artworkCache.get(key)
	if (cached && cached.expiresAt > Date.now()) return cached.url
	if (cached) artworkCache.delete(key)

	const pending = artworkPending.get(key)
	if (pending) return pending

	const request = (async () => {
		try {
			const { spicyamll, normalizeTracks } = await import('$lib/services/spicyamll.ts')
			const tracks = normalizeTracks(await spicyamll.song(key))
			const match =
				tracks.find((track) => String(track.id) === key) ??
				tracks.find((track) => track.name.toLowerCase() === title.toLowerCase()) ??
				tracks.find((track) => String(track.artist ?? '').toLowerCase() === artist.toLowerCase())

			const url = match?.image
			return isPublicArtworkUrl(url) ? url : undefined
		} catch {
			return undefined
		}
	})()

	artworkPending.set(key, request)
	try {
		const url = await request
		artworkCache.set(key, { url, expiresAt: Date.now() + 60 * 60_000 })
		return url
	} finally {
		artworkPending.delete(key)
	}
}

export const resolveDiscordArtwork = async (
	artwork: string | undefined,
	remoteId: number | string | undefined,
	title: string,
	artist: string,
): Promise<string | undefined> => {
	// Blob URLs are browser-local and cannot be fetched by Discord.
	if (isPublicArtworkUrl(artwork)) return artwork
	return resolveRemoteArtwork(remoteId, title, artist)
}

let lastState: string | null = null

const getState = (payload: DiscordPresencePayload): AdiMusicRpcState => ({
	playing: payload.playing,
	title: payload.title,
	artist: payload.artist,
	album: payload.album || undefined,
	artwork: payload.artwork || undefined,
	position: Number.isFinite(payload.position) ? Math.max(0, payload.position) : 0,
	duration: Number.isFinite(payload.duration) ? Math.max(0, payload.duration) : 0,
	url: payload.url || window.location.href || SITE_ORIGIN,
})

const publish = (state: AdiMusicRpcState | undefined): void => {
	if (typeof window === 'undefined') return

	if (!state) {
		if (window.__ADI_MUSIC_RPC__ !== undefined) {
			delete window.__ADI_MUSIC_RPC__
			window.adiNative?.discord.clearPresence()
			window.dispatchEvent(new CustomEvent('adi-music-rpc', { detail: null }))
		}
		lastState = null
		return
	}

	const positionBucket = Math.floor(state.position / 2)
	const normalized = JSON.stringify({ ...state, position: positionBucket })

	if (normalized === lastState) return

	lastState = normalized
	window.__ADI_MUSIC_RPC__ = state
	window.adiNative?.discord.setPresence(state)
	window.adiNative?.media.setNowPlaying(state)
	window.dispatchEvent(new CustomEvent('adi-music-rpc', { detail: state }))
}

export const updateDiscordPresence = (payload: DiscordPresencePayload): void => {
	publish(getState(payload))
}

export const clearDiscordPresence = (): void => {
	publish(undefined)
}
