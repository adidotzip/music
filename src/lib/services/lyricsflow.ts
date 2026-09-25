import { searchDiscovery, type DiscoveryResource } from './spicyamll.ts'

const API_BASE_URL = (
	import.meta.env.PUBLIC_LYRICSFLOW_API_URL ||
	import.meta.env.VITE_LYRICSFLOW_API_URL ||
	''
).replace(/\/$/, '')

type AppleMusicArtist = {
	id?: string | number
	type?: string
	attributes?: { name?: string; url?: string; genreNames?: string[]; artwork?: { url?: string } }
	relationships?: { albums?: { data?: AppleMusicResource[] }; songs?: { data?: AppleMusicResource[] } }
}

type AppleMusicResource = {
	id?: string | number
	type?: string
	attributes?: { name?: string; artistName?: string; albumName?: string; artwork?: { url?: string } }
}

const requestArtist = async (artistId: string): Promise<AppleMusicArtist | null> => {
	if (!API_BASE_URL) return null
	try {
		const response = await fetch(
			`${API_BASE_URL}/artist?artist=${encodeURIComponent(artistId)}`,
			{ headers: { Accept: 'application/json' } },
		)
		if (!response.ok) return null
		const payload = (await response.json()) as { data?: AppleMusicArtist[] | AppleMusicArtist }
		const data = payload?.data
		return Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
	} catch {
		return null
	}
}

const artworkUrl = (url?: string, size = 600) =>
	url?.replace(/\{w\}/g, String(size)).replace(/\{h\}/g, String(size)).replace(/\{f\}/g, 'jpg').replace(/\{c\}/g, 'bb') || 'favicon.svg'

const mapResource = (item: AppleMusicResource, type: 'song' | 'album', artistName: string): DiscoveryResource | null => {
	const attributes = item.attributes
	const name = attributes?.name
	if (!name || !item.id) return null
	return {
		type,
		id: String(item.id),
		name,
		artist: attributes?.artistName || artistName,
		album: type === 'album' ? name : attributes?.albumName || '',
		artUrl: artworkUrl(attributes?.artwork?.url),
	}
}

export interface LyricsflowArtistProfile {
	name: string
	artUrl?: string
	songs: DiscoveryResource[]
	albums: DiscoveryResource[]
}

export const getLyricsflowArtistProfile = async (
	artistId: string,
	artistName?: string,
): Promise<LyricsflowArtistProfile> => {
	const artist = await requestArtist(artistId)

	// The LyricsFlow /artist endpoint is the primary source. If the proxy is not
	// configured or unavailable, keep artist profiles usable through the existing
	// SpicyAMLL discovery API instead of rendering a dead-end error page.
	if (!artist) {
		const fallbackName = artistName?.trim()
		if (!fallbackName) throw new Error('Unable to load artist profile.')

		const fallback = (await searchDiscovery(fallbackName)).filter(
			(item) => item.type === 'song' && item.artist.toLowerCase() === fallbackName.toLowerCase(),
		)

		return {
			name: fallbackName,
			artUrl: fallback[0]?.artUrl,
			songs: fallback,
			albums: [],
		}
	}

	const name = artist.attributes?.name || artistName || artistId
	const songs = (artist.relationships?.songs?.data ?? [])
		.map((item) => mapResource(item, 'song', name))
		.filter((item): item is DiscoveryResource => !!item)
	let albums = (artist.relationships?.albums?.data ?? [])
		.map((item) => mapResource(item, 'album', name))
		.filter((item): item is DiscoveryResource => !!item)

	return {
		name,
		artUrl: artworkUrl(artist.attributes?.artwork?.url, 1200),
		songs,
		albums,
	}
}
