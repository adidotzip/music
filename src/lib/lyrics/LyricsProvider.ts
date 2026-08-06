import { formatArtists } from '$lib/helpers/utils/text.ts'
import type { TrackData } from '$lib/library/get/value-queries.ts'

export interface ProviderResponse {
	rawLyrics: string
	source: 'adi' | 'lrclib'
	isPlainOnly?: boolean
}

export class LyricsProvider {
	static async fetchFromAdi(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
		try {
			const query = `${track.name} ${formatArtists(track.artists)}`
			const searchUrl = new URL('https://lyrics.imreallyadi.space/api/search')
			searchUrl.searchParams.set('q', query)

			const searchResponse = await fetch(searchUrl, { signal })
			if (!searchResponse.ok) return null

			const searchData = await searchResponse.json()
			if (!searchData.ok || !Array.isArray(searchData.results) || searchData.results.length === 0) {
				return null
			}

			const bestMatch = searchData.results[0]
			if (!bestMatch || !bestMatch.id) return null

			// 1. Request QRC explicitly using the format=qrc parameter
			const lyricUrl = `https://lyrics.imreallyadi.space/api/lyrics/${bestMatch.id}?format=qrc`
			const lyricResponse = await fetch(lyricUrl, { signal })
			if (!lyricResponse.ok) return null

			const lyricData = await lyricResponse.json()
			if (!lyricData.ok || !lyricData.lyric) return null

			// Check if QRC is available in rawContent
			if (lyricData.lyric.format === 'qrc' && lyricData.lyric.rawContent) {
				return {
					rawLyrics: lyricData.lyric.rawContent,
					source: 'adi',
					isPlainOnly: false
				}
			}

			// 2. If QRC is unavailable, fall back to plain lyrics from Adi Lyrics if available
			if (lyricData.lyric.lyrics) {
				return {
					rawLyrics: lyricData.lyric.lyrics,
					source: 'adi',
					isPlainOnly: true
				}
			}

			return null
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') throw error
			return null
		}
	}

	static async fetchFromLrclib(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
		const durationSeconds = Math.round(track.duration)
		try {
			// Try exact lookup first
			const exactUrl = new URL('https://lrclib.net/api/get')
			exactUrl.searchParams.set('track_name', track.name)
			exactUrl.searchParams.set('artist_name', formatArtists(track.artists))
			exactUrl.searchParams.set('album_name', track.album)
			exactUrl.searchParams.set('duration', String(durationSeconds))

			const exactResponse = await fetch(exactUrl, { signal })
			if (exactResponse.ok) {
				const data = await exactResponse.json()
				if (data.instrumental) {
					return {
						rawLyrics: 'Instrumental',
						source: 'lrclib',
						isPlainOnly: false
					}
				}
				if (data.syncedLyrics) {
					return {
						rawLyrics: data.syncedLyrics,
						source: 'lrclib',
						isPlainOnly: false
					}
				}
				if (data.plainLyrics) {
					return {
						rawLyrics: data.plainLyrics,
						source: 'lrclib',
						isPlainOnly: true
					}
				}
			}

			// Fallback to search query
			const searchUrl = new URL('https://lrclib.net/api/search')
			searchUrl.searchParams.set('track_name', track.name)
			searchUrl.searchParams.set('artist_name', formatArtists(track.artists))
			searchUrl.searchParams.set('duration', String(durationSeconds))

			const searchResponse = await fetch(searchUrl, { signal })
			if (!searchResponse.ok) return null

			const searchData = await searchResponse.json()
			if (!Array.isArray(searchData) || searchData.length === 0) return null

			// Filter/score and find the best match with 4-second duration tolerance
			const bestMatch = searchData.find((item: any) => {
				return item.duration && Math.abs(item.duration - durationSeconds) <= 4
			})

			if (!bestMatch) return null

			if (bestMatch.syncedLyrics) {
				return {
					rawLyrics: bestMatch.syncedLyrics,
					source: 'lrclib',
					isPlainOnly: false
				}
			}

			if (bestMatch.plainLyrics) {
				return {
					rawLyrics: bestMatch.plainLyrics,
					source: 'lrclib',
					isPlainOnly: true
				}
			}

			return null
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') throw error
			return null
		}
	}
}
