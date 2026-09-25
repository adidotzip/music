import { getSongsForArtist, searchDiscovery, type DiscoveryResource } from './spicyamll.ts'

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

		const discovery = await searchDiscovery(fallbackName)
		const fallback = discovery.filter(
			(item) => item.type === 'song' && item.artist.toLowerCase() === fallbackName.toLowerCase(),
		)
		const artistResult = discovery.find(
			(item) => item.type === 'artist' && item.name.toLowerCase() === fallbackName.toLowerCase(),
		)

		return {
			name: artistResult?.name || fallbackName,
			// Never use a song's album artwork as the artist PFP. Prefer the
			// dedicated artist resource returned by discovery.
			artUrl: artistResult?.artUrl,
			songs: fallback,
			albums: [],
		}
	}

	const name = artist.attributes?.name || artistName || artistId
	const catalogSongs = (artist.relationships?.songs?.data ?? [])
		.map((item) => mapResource(item, 'song', name))
		.filter((item): item is DiscoveryResource => !!item)

	// /artist can expose only a partial relationship. Fetch the complete artist
	// catalog separately so the profile does not stop after the first few tracks.
	let songs = catalogSongs
	try {
		const completeSongs = await getSongsForArtist(artistId, name)
		const normalized = completeSongs
			.filter((song) => !song.artist || song.artist.toLowerCase() === name.toLowerCase())
			.map((song) => ({
				type: 'song' as const,
				id: String(song.id),
				name: song.name,
				artist: song.artist || name,
				album: song.album || song.albumName || '',
				artUrl: artworkUrl(song.image || song.artwork || song.cover || song.coverUrl, 600),
			}))
		const seen = new Set<string>()
		songs = [...normalized, ...catalogSongs].filter((song) => {
			if (seen.has(song.id)) return false
			seen.add(song.id)
			return true
		})
	} catch {
		// Keep the /artist relationship results if the catalog request fails.
	}

	let albums = (artist.relationships?.albums?.data ?? [])
		.map((item) => mapResource(item, 'album', name))
		.filter((item): item is DiscoveryResource => !!item)

	// Album relationship entries can contain only IDs. Use discovery to enrich
	// them with names/artwork without changing the primary artist endpoint.
	if (!albums.length) {
		try {
			albums = (await searchDiscovery(name))
				.filter((item) => item.type === 'album' && (!item.artist || item.artist.toLowerCase() === name.toLowerCase()))
				.slice(0, 25)
		} catch {
			// Albums are optional and should never make the artist page fail.
		}
	}

	return {
		name,
		artUrl: artworkUrl(artist.attributes?.artwork?.url, 1200),
		songs,
		albums,
	}
}
