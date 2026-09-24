import { getDatabase } from '$lib/db/database.ts'
import { dispatchDatabaseChangedEvent } from '$lib/db/events.ts'
import type { Album, Track } from '$lib/library/types.ts'
import { spicyamll } from './spicyamll.ts'

const ARTIST_FAVORITES_KEY = 'adi_music_favorite_artists'
const SONG_FAVORITES_KEY = 'adi_music_favorite_songs'

export type OnlineArtist = {
	id: string
	name: string
	artUrl: string
	genre: string
	bio: string
}


export function getFavoriteSongIds(): string[] {
	if (typeof localStorage === 'undefined') return []
	try {
		const value = JSON.parse(localStorage.getItem(SONG_FAVORITES_KEY) || '[]')
		return Array.isArray(value) ? value.map(String) : []
	} catch {
		return []
	}
}

export function isFavoriteSong(id: string | number) {
	return getFavoriteSongIds().includes(String(id))
}

export function toggleFavoriteSong(id: string | number) {
	if (typeof localStorage === 'undefined') return false
	const key = String(id)
	const ids = getFavoriteSongIds()
	const next = ids.includes(key) ? ids.filter((item) => item !== key) : [key, ...ids]
	localStorage.setItem(SONG_FAVORITES_KEY, JSON.stringify(next))
	window.dispatchEvent(new CustomEvent('adi-music-favorite-songs-changed', { detail: { id: key, favorite: !ids.includes(key) } }))
	return !ids.includes(key)
}

export function getFavoriteArtistIds(): string[] {
	if (typeof localStorage === 'undefined') return []
	try {
		const value = JSON.parse(localStorage.getItem(ARTIST_FAVORITES_KEY) || '[]')
		return Array.isArray(value) ? value.map(String) : []
	} catch {
		return []
	}
}

export function isFavoriteArtist(id: string | number) {
	return getFavoriteArtistIds().includes(String(id))
}

export function toggleFavoriteArtist(id: string | number) {
	if (typeof localStorage === 'undefined') return false
	const key = String(id)
	const ids = getFavoriteArtistIds()
	const next = ids.includes(key) ? ids.filter((item) => item !== key) : [key, ...ids]
	localStorage.setItem(ARTIST_FAVORITES_KEY, JSON.stringify(next))
	window.dispatchEvent(new CustomEvent('adi-music-favorite-artists-changed'))
	return !ids.includes(key)
}

export const artistFromSearch = (item: Record<string, unknown>): OnlineArtist => {
	const attributes = item.attributes && typeof item.attributes === 'object'
		? item.attributes as Record<string, unknown>
		: item
	const artwork = attributes.artwork && typeof attributes.artwork === 'object'
		? attributes.artwork as Record<string, unknown>
		: {}
	return {
		id: String(attributes.id ?? item.id ?? ''),
		name: String(attributes.name ?? item.name ?? 'Artist'),
		artUrl: String(artwork.url ?? item.artUrl ?? item.image ?? 'favicon.svg')
			.replace('{w}', '1200').replace('{h}', '1200').replace('{f}', 'jpg'),
		genre: String(attributes.genreNames && Array.isArray(attributes.genreNames) ? attributes.genreNames[0] : attributes.genre ?? 'Music'),
		bio: String(attributes.editorialNotes && typeof attributes.editorialNotes === 'object'
			? (attributes.editorialNotes as Record<string, unknown>).short ?? ''
			: ''),
	}
}

export async function downloadSongToLibrary(songId: string | number, metadata?: Partial<Track>) {
	const id = Number(songId)
	if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid song ID')

	const db = await getDatabase()
	const existingTracks = await db.getAll('tracks')
	const found = existingTracks.find((track) => track.uuid === `spicyamll:${id}`)
	if (found) return found

	// Use AAC for the local library. The reference downloader uses the same
	// /download endpoint, while AAC keeps the stored File browser-compatible.
	const response = await fetch(spicyamll.downloadUrl(id, { codec: 'aac', language: 'en-US' }))
	if (!response.ok) throw new Error(`Download failed: ${response.status}`)
	const blob = await response.blob()
	if (!blob.size) throw new Error('Download returned an empty file')

	const name = String(metadata?.name || `track-${id}`).replace(/[\\/:*?"<>|]/g, '_')
	const file = new File([blob], `${name}.m4a`, { type: blob.type || 'audio/mp4' })

	const track: Omit<Track, 'id'> = {
		uuid: `spicyamll:${id}`,
		name: String(metadata?.name || name),
		album: String(metadata?.album || '~\\0unknown'),
		artists: metadata?.artists?.length ? metadata.artists : ['Unknown Artist'],
		year: metadata?.year || '~\\0unknown',
		duration: Number(metadata?.duration || 0),
		genre: metadata?.genre || [],
		trackNo: Number(metadata?.trackNo || 0),
		trackOf: Number(metadata?.trackOf || 0),
		discNo: Number(metadata?.discNo || 0),
		discOf: Number(metadata?.discOf || 0),
		language: metadata?.language,
		image: metadata?.image,
		file,
		scannedAt: Date.now(),
		fileName: file.name,
		directory: undefined,
		url: undefined,
	}

	const trackId = await db.add('tracks', track)
	dispatchDatabaseChangedEvent({ operation: 'add', storeName: 'tracks', key: trackId, value: { ...track, id: trackId } })
	return { ...track, id: trackId }
}

export async function downloadAlbumToLibrary(
	albumId: string | number,
	metadata?: { name?: string; artist?: string; year?: string; artUrl?: string },
) {
	const id = Number(albumId)
	if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid album ID')

	const tracks = await spicyamll.albumTracks(id)
	if (!tracks.length) throw new Error('Album contains no downloadable tracks')

	const results: Track[] = []
	for (let index = 0; index < tracks.length; index++) {
		const track = tracks[index]
		results.push(await downloadSongToLibrary(track.id, {
			name: track.name,
			album: track.album || metadata?.name || '~\\0unknown',
			artists: track.artists?.length ? track.artists : [track.artist || metadata?.artist || 'Unknown Artist'],
			year: track.year ? String(track.year) : (metadata?.year || '~\\0unknown'),
			duration: track.duration || 0,
			genre: [],
			trackNo: index + 1,
			trackOf: tracks.length,
			discNo: 1,
			discOf: 1,
			image: track.image ? { optimized: false, small: track.image, full: track.image } : undefined,
		}))
	}

	// Also create the native album record so the album appears in Library > Albums.
	const existingAlbums = await db.getAll('albums')
	const uuid = `spicyamll:album:${id}`
	const existingAlbum = existingAlbums.find((album) => album.uuid === uuid)
	if (!existingAlbum) {
		const album: Omit<Album, 'id'> = {
			uuid,
			name: metadata?.name || results[0]?.album || `Album ${id}`,
			artists: [metadata?.artist || results[0]?.artists?.[0] || 'Unknown Artist'],
			year: metadata?.year,
			image: undefined,
		}
		const albumDbId = await db.add('albums', album)
		dispatchDatabaseChangedEvent({ operation: 'add', storeName: 'albums', key: albumDbId, value: { ...album, id: albumDbId } })
	}

	return results
}
