import type { DiscoveryResource } from './spicyamll.ts'
import { parseDiscoveryResults, spicyamll } from './spicyamll.ts'

const API_BASE_URL = (
	import.meta.env.PUBLIC_LYRICSFLOW_API_URL ||
	import.meta.env.VITE_LYRICSFLOW_API_URL ||
	''
).replace(/\/$/, '')

const request = async <T>(path: string, artist: string): Promise<T | null> => {
	if (!API_BASE_URL) return null

	try {
		const response = await fetch(
			`${API_BASE_URL}${path}?artist=${encodeURIComponent(artist)}`,
			{ headers: { Accept: 'application/json' } },
		)

		if (!response.ok) return null
		return (await response.json()) as T
	} catch {
		return null
	}
}

const extractArray = (value: unknown): unknown[] => {
	if (Array.isArray(value)) return value
	if (!value || typeof value !== 'object') return []

	const object = value as Record<string, unknown>
	for (const key of ['data', 'results', 'songs', 'albums', 'items']) {
		if (Array.isArray(object[key])) return object[key]
		if (object[key] && typeof object[key] === 'object') {
			const nested = extractArray(object[key])
			if (nested.length) return nested
		}
	}

	return []
}

const mapAppleMusicItem = (item: any, type: 'song' | 'album'): DiscoveryResource | null => {
	const attributes = item?.attributes ?? item
	const name = attributes?.name
	if (!name) return null

	const artwork = attributes?.artwork?.url
		?.replace('{w}', '600')
		.replace('{h}', '600')
		.replace('{f}', 'jpg')
		.replace('{c}', 'bb')

	return {
		type,
		id: String(item?.id ?? attributes?.id ?? name),
		name: String(name),
		artist: String(
			attributes?.artistName ??
			attributes?.artist?.name ??
			'',
		),
		album: type === 'song' ? String(attributes?.albumName ?? '') : undefined,
		artUrl: artwork,
	} as DiscoveryResource
}

export interface LyricsflowArtistProfile {
	name: string
	artUrl?: string
	songs: DiscoveryResource[]
	albums: DiscoveryResource[]
}

export const getLyricsflowArtistProfile = async (
	artist: string,
): Promise<LyricsflowArtistProfile> => {
	const [artistResponse, songsResponse, albumsResponse] = await Promise.all([
		request<unknown>('/artist', artist),
		request<unknown>('/artist/songs', artist),
		request<unknown>('/artist/albums', artist),
	])

	const artistObject =
		artistResponse && typeof artistResponse === 'object'
			? (artistResponse as any)
			: undefined

	const artistData = artistObject?.data ?? artistObject?.artist ?? artistObject
	const artistAttributes = artistData?.attributes ?? artistData

	const songs = extractArray(songsResponse)
		.map((item) => mapAppleMusicItem(item, 'song'))
		.filter((item): item is DiscoveryResource => !!item)

	const albums = extractArray(albumsResponse)
		.map((item) => mapAppleMusicItem(item, 'album'))
		.filter((item): item is DiscoveryResource => !!item)

	if (songs.length || albums.length || artistAttributes?.name) {
		return {
			name: String(artistAttributes?.name || artist),
			artUrl: artistAttributes?.artwork?.url
				?.replace('{w}', '1200')
				.replace('{h}', '1200')
				.replace('{f}', 'jpg')
				.replace('{c}', 'bb'),
			songs,
			albums,
		}
	}

	// Keep artist profiles functional when the optional LyricsFlow proxy is not configured.
	const fallback = await spicyamll.search({
		term: artist,
		types: 'songs',
		limit: 50,
	})

	const fallbackItems = parseDiscoveryResults(fallback).filter(
		(item) => item.type === 'song' && item.artist.toLowerCase() === artist.toLowerCase(),
	)

	return {
		name: artist,
		artUrl: fallbackItems[0]?.artUrl,
		songs: fallbackItems,
		albums: [],
	}
}
