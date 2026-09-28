import { normalizeTracks, spicyamll } from '$lib/services/spicyamll.ts'

export interface DiscordPresencePayload {
\ttitle: string
\tartist: string
\talbum?: string
\tartwork?: string
\tplaying: boolean
\tposition: number
\tduration: number
\turl?: string
}

export interface AdiMusicRpcState {
\tplaying: boolean
\ttitle: string
\tartist: string
\talbum?: string
\tartwork?: string
\tposition: number
\tduration: number
\turl: string
}

declare global {
\tinterface Window {
\t\t__ADI_MUSIC_RPC__?: AdiMusicRpcState
\t\tadiNative?: {
\t\t\tplatform: string
\t\t\tisDesktop: boolean
\t\t\tdiscord: {
\t\t\t\tsetPresence: (presence: AdiMusicRpcState) => void
\t\t\t\tclearPresence: () => void
\t\t\t}
\t\t\tmedia: {
\t\t\t\tsetNowPlaying: (metadata: AdiMusicRpcState) => void
\t\t\t}
\t\t}
\t}
}

const SITE_ORIGIN = 'https://music.imreallyadi.space'

const artworkCache = new Map<string, { url: string | undefined; expiresAt: number }>()
const artworkPending = new Map<string, Promise<string | undefined>>()

const isPublicArtworkUrl = (value: string | undefined): value is string =>
\t!!value && /^https?:\\/\\//i.test(value)

const resolveRemoteArtwork = async (
\tremoteId: number | string | undefined,
\ttitle: string,
\tartist: string,
): Promise<string | undefined> => {
\tconst hasRemoteId = remoteId !== undefined && remoteId !== null && String(remoteId).trim() !== ''
\tconst key = hasRemoteId ? `id:${String(remoteId)}` : `search:${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}`
\tconst cached = artworkCache.get(key)
\tif (cached && cached.expiresAt > Date.now()) return cached.url
\tif (cached) artworkCache.delete(key)

\tconst pending = artworkPending.get(key)
\tif (pending) return pending

\tconst request = (async () => {
\t\ttry {
\t\t\tconst tracks = hasRemoteId
\t\t\t\t? normalizeTracks(await spicyamll.song(String(remoteId)))
\t\t\t\t: normalizeTracks(await spicyamll.search({ term: `${title} ${artist}`, types: 'songs', limit: 10 }))
\t\t\tconst normalizedTitle = title.trim().toLowerCase()
\t\t\tconst normalizedArtist = artist.trim().toLowerCase()
\t\t\tconst match = hasRemoteId
\t\t\t\t? tracks.find((track) => String(track.id) === String(remoteId)) ?? tracks[0]
\t\t\t\t: tracks.find(
\t\t\t\t\t\t(track) =>
\t\t\t\t\t\t\ttrack.name.trim().toLowerCase() === normalizedTitle &&
\t\t\t\t\t\t\tString(track.artist ?? '').trim().toLowerCase() === normalizedArtist,
\t\t\t\t\t\t) ??
\t\t\t\t\ttracks.find((track) => track.name.trim().toLowerCase() === normalizedTitle)

\t\t\tconst url = match?.image
\t\t\treturn isPublicArtworkUrl(url) ? url : undefined
\t\t} catch {
\t\t\treturn undefined
\t\t}
\t})()

\tartworkPending.set(key, request)
\ttry {
\t\tconst url = await request
\t\tartworkCache.set(key, { url, expiresAt: Date.now() + 60 * 60_000 })
\t\treturn url
\t} finally {
\t\tartworkPending.delete(key)
\t}
}

export const resolveDiscordArtwork = async (
\tartwork: string | undefined,
\tremoteId: number | string | undefined,
\ttitle: string,
\tartist: string,
): Promise<string | undefined> => {
\t// Use the exact artwork URL currently used by the player whenever Discord
\t// can access it. Blob URLs are browser-local, so only those need fallback
\t// resolution through the remote track metadata.
\tif (isPublicArtworkUrl(artwork)) return artwork
\treturn resolveRemoteArtwork(remoteId, title, artist)
}

let lastState: string | null = null

const getState = (payload: DiscordPresencePayload): AdiMusicRpcState => ({
\tplaying: payload.playing,
\ttitle: payload.title,
\tartist: payload.artist,
\talbum: payload.album || undefined,
\tartwork: payload.artwork || undefined,
\tposition: Number.isFinite(payload.position) ? Math.max(0, payload.position) : 0,
\tduration: Number.isFinite(payload.duration) ? Math.max(0, payload.duration) : 0,
\turl: payload.url || window.location.href || SITE_ORIGIN,
})

const publish = (state: AdiMusicRpcState | undefined): void => {
\tif (typeof window === 'undefined') return

\tif (!state) {
\t\tif (window.__ADI_MUSIC_RPC__ !== undefined) {
\t\t\tdelete window.__ADI_MUSIC_RPC__
\t\t\twindow.adiNative?.discord.clearPresence()
\t\t\twindow.dispatchEvent(new CustomEvent('adi-music-rpc', { detail: null }))
\t\t}
\t\tlastState = null
\t\treturn
\t}

\tconst positionBucket = Math.floor(state.position)
\tconst normalized = JSON.stringify({ ...state, position: positionBucket })

\tif (normalized === lastState) return

\tlastState = normalized
\twindow.__ADI_MUSIC_RPC__ = state
\twindow.adiNative?.discord.setPresence(state)
\twindow.adiNative?.media.setNowPlaying(state)
\twindow.dispatchEvent(new CustomEvent('adi-music-rpc', { detail: state }))
}

export const updateDiscordPresence = (payload: DiscordPresencePayload): void => {
\tpublish(getState(payload))
}

export const clearDiscordPresence = (): void => {
\tpublish(undefined)
}
