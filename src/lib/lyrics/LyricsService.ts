import type { TrackData } from '$lib/library/get/value-queries.ts'
import { LyricsProvider } from './LyricsProvider.ts'
import { LyricsParser } from './LyricsParser.ts'
import { LyricsCache, type CachedLyricsResult } from './LyricsCache.ts'

export type ServiceLyricsResult = CachedLyricsResult

export class LyricsService {
	static async fetchLyrics(track: TrackData, signal?: AbortSignal): Promise<ServiceLyricsResult> {
		const cached = await LyricsCache.get(track.id)
		if (cached) {
			return cached
		}

		try {
			const durationMs = Math.round(track.duration) * 1000
			let adiPlain: string | null = null

			// A. Query Adi Lyrics
			try {
				const adiResponse = await LyricsProvider.fetchFromAdi(track, signal)
				if (adiResponse) {
					if (!adiResponse.isPlainOnly) {
						// Found QRC synchronized lyrics from Adi Lyrics
						const lyrics = LyricsParser.parse(adiResponse.rawLyrics, durationMs)
						const result: ServiceLyricsResult = {
							status: 'found',
							source: 'adi',
							lyrics,
							syncType: 'karaoke'
						}
						await LyricsCache.set(track.id, result)
						return result
					} else {
						adiPlain = adiResponse.rawLyrics
					}
				}
			} catch (e) {
				if (e instanceof Error && e.name === 'AbortError') throw e
				// Continue to fallback
			}

			// B. Query LRCLib
			try {
				const lrclibResponse = await LyricsProvider.fetchFromLrclib(track, signal)
				if (lrclibResponse) {
					if (lrclibResponse.rawLyrics === 'Instrumental') {
						const result: ServiceLyricsResult = { status: 'instrumental' }
						await LyricsCache.set(track.id, result)
						return result
					}

					if (!lrclibResponse.isPlainOnly) {
						// Found synchronized lyrics from LRCLib
						const lyrics = LyricsParser.parse(lrclibResponse.rawLyrics, durationMs)
						const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
						const result: ServiceLyricsResult = {
							status: 'found',
							source: 'lrclib',
							lyrics,
							syncType: hasWordTiming ? 'karaoke' : 'line'
						}
						await LyricsCache.set(track.id, result)
						return result
					} else if (!adiPlain) {
						// If LRCLib only has plain lyrics, and we didn't get plain from Adi, keep LRCLib plain
						adiPlain = lrclibResponse.rawLyrics
					}
				}
			} catch (e) {
				if (e instanceof Error && e.name === 'AbortError') throw e
				// Continue to fallback
			}

			// C. Fall back to Plain lyrics if found
			if (adiPlain) {
				const lyrics = LyricsParser.parse(adiPlain, durationMs)
				const result: ServiceLyricsResult = {
					status: 'found',
					source: 'plain',
					lyrics,
					syncType: 'plain'
				}
				await LyricsCache.set(track.id, result)
				return result
			}

			const notFoundResult: ServiceLyricsResult = { status: 'not-found' }
			await LyricsCache.set(track.id, notFoundResult)
			return notFoundResult

		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') throw error
			return { status: 'error' }
		}
	}
}
