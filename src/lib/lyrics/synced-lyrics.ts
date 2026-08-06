import { detectParser, type Lyric } from '@braccato/parsers'
import { getDatabase } from '$lib/db/database.ts'
import { formatArtists, formatNameOrUnknown } from '$lib/helpers/utils/text.ts'
import type { TrackData } from '$lib/library/get/value.ts'

const LYRICSPLUS_LYRICS_ENDPOINT = 'https://lyricsplus.prjktla.workers.dev/v2/lyrics/get'
const LRCLIB_GET_ENDPOINT = 'https://lrclib.net/api/get'
const LRCLIB_SEARCH_ENDPOINT = 'https://lrclib.net/api/search'
const UNISON_GET_ENDPOINT = 'https://unison.boidu.dev/lyrics'

const LRCLIB_DURATION_TOLERANCE_SECONDS = 4
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7
const CACHE_VERSION = 11 // Bumped to invalidate old caches and apply Braccato parsing

export interface SyncedLyricsWord {
	string: string
	time: number
	isSecondary?: boolean
}

export interface SyncedLyricsLine {
	startTime: number
	endTime: number
	words: SyncedLyricsWord[]
	translation?: string
	romanization?: string
	isInstrumental?: boolean
}

export type SyncedLyricsSource = 'adi' | 'better' | 'lyricsplus' | 'lrclib' | 'unison'

export type LyricsSyncMode = 'karaoke' | 'line'

export type SyncedLyricsResult =
	| {
			status: 'found'
			source: SyncedLyricsSource
			lines: SyncedLyricsLine[]
			syncType: LyricsSyncMode
	  }
	| { status: 'not-found' | 'instrumental' | 'error' }

interface UnknownRecord {
	[key: string]: unknown
}

interface LrclibLyricsResponse {
	trackName?: string
	artistName?: string
	albumName?: string
	duration?: number
	instrumental?: boolean
	syncedLyrics?: string | null
}

interface UnisonLyricsResponse {
	success: boolean
	data?: {
		lyrics?: string
	}
}

const isRecord = (value: unknown): value is UnknownRecord =>
	typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value)

export const mapBraccatoToSyncedLyrics = (lyrics: Lyric[]): SyncedLyricsLine[] => {
	return lyrics.map((lyric) => {
		const startTime = lyric.startTimeMs
		const endTime = lyric.startTimeMs + lyric.durationMs

		// Map parts to SyncedLyricsWord
		let words: SyncedLyricsWord[] = []
		if (lyric.parts && lyric.parts.length > 0) {
			const validParts = lyric.parts.filter((part) => part.words.trim() !== '')
			words = validParts.map((part, idx) => {
				let str = part.words
				if (idx < validParts.length - 1 && !str.endsWith(' ')) {
					str += ' '
				}
				return {
					string: str,
					time: part.startTimeMs,
				}
			})
		} else {
			// No word/syllable timing, treat the whole line as one word
			words = [
				{
					string: lyric.words || '',
					time: lyric.startTimeMs,
				},
			]
		}

		// Find translation: get first translation if available
		let translation: string | undefined
		if (lyric.translation?.text) {
			translation = lyric.translation.text
		} else if (lyric.translations) {
			const langs = Object.keys(lyric.translations)
			if (langs.length > 0) {
				const langKey = langs[0]
				if (langKey) {
					translation = lyric.translations[langKey]
				}
			}
		}

		return {
			startTime,
			endTime,
			words,
			translation,
			romanization: lyric.romanization,
			isInstrumental: lyric.isInstrumental,
		}
	})
}

// Keep original robust LRC parsing to satisfy multiple LRC timestamps on one line test
const timestampPattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g
const whitespacePattern = /\s+/

const parseTimestamp = (minutes: string, seconds: string, fraction: string | undefined): number => {
	const msString = (fraction ?? '0').padEnd(3, '0').slice(0, 3)
	return (
		Number.parseInt(minutes, 10) * 60_000 +
		Number.parseInt(seconds, 10) * 1000 +
		Number.parseInt(msString, 10)
	)
}

export const parseLrc = (lyrics: string, durationMs: number): SyncedLyricsLine[] => {
	const timestampedLines = lyrics
		.split('\n')
		.flatMap((rawLine) => {
			const matches = [...rawLine.matchAll(timestampPattern)]
			if (matches.length === 0) return []
			const text = rawLine.replace(timestampPattern, '').trim()
			if (!text) return []
			return matches.map((match) => {
				const m1 = match[1]
				const m2 = match[2]
				if (!m1 || !m2) return null
				return {
					startTime: parseTimestamp(m1, m2, match[3] as string | undefined),
					text,
				}
			})
		})
		.filter((line): line is { startTime: number; text: string } => line !== null)
		.sort((a, b) => a.startTime - b.startTime)

	const lines = timestampedLines.map((line, index) => {
		const nextLine = timestampedLines[index + 1]
		const endTime = nextLine ? nextLine.startTime : Math.max(durationMs, line.startTime + 2000)
		const wordsList = line.text.split(whitespacePattern).filter(Boolean)

		return {
			startTime: line.startTime,
			endTime,
			words: wordsList.map((word, i) => ({
				string: word + (i === wordsList.length - 1 ? '' : ' '),
				time: line.startTime,
			})),
		}
	})

	return deduplicateLines(lines)
}

const getDurationSeconds = (track: TrackData): number => Math.round(track.duration)

const isDurationClose = (actualDuration: number | undefined, expectedDuration: number): boolean =>
	!(actualDuration && expectedDuration) ||
	Math.abs(Math.round(actualDuration) - expectedDuration) <= LRCLIB_DURATION_TOLERANCE_SECONDS

const getLrclibResponse = (value: unknown): LrclibLyricsResponse | undefined => {
	if (!isRecord(value)) return
	return {
		trackName: typeof value.trackName === 'string' ? value.trackName : undefined,
		artistName: typeof value.artistName === 'string' ? value.artistName : undefined,
		albumName: typeof value.albumName === 'string' ? value.albumName : undefined,
		duration: isFiniteNumber(value.duration) ? value.duration : undefined,
		instrumental: typeof value.instrumental === 'boolean' ? value.instrumental : undefined,
		syncedLyrics: typeof value.syncedLyrics === 'string' ? value.syncedLyrics : null,
	}
}

const getLrclibFoundResult = (
	data: LrclibLyricsResponse,
	durationSeconds: number,
): SyncedLyricsResult => {
	if (data.instrumental) return { status: 'instrumental' }
	if (!data.syncedLyrics) return { status: 'not-found' }

	const rawLyrics = data.syncedLyrics
	const durationMs = durationSeconds * 1000
	const parser = detectParser(rawLyrics)
	const parsed = parser.parse(rawLyrics, durationMs)
	const lines = mapBraccatoToSyncedLyrics(parsed)

	return lines.length > 0
		? { status: 'found', source: 'lrclib', lines, syncType: 'line' }
		: { status: 'not-found' }
}

const scoreLrclibSearchResult = (
	data: LrclibLyricsResponse,
	track: TrackData,
	durationSeconds: number,
): number => {
	if (!(data.syncedLyrics && isDurationClose(data.duration, durationSeconds)))
		return Number.NEGATIVE_INFINITY

	const expectedTrackName = normalizeSearchText(track.name)
	const expectedArtistName = normalizeSearchText(formatArtists(track.artists))
	const expectedAlbumName = normalizeSearchText(formatNameOrUnknown(track.album, '' as any))
	const resultTrackName = normalizeSearchText(data.trackName ?? '')
	const resultArtistName = normalizeSearchText(data.artistName ?? '')
	const resultAlbumName = normalizeSearchText(data.albumName ?? '')

	let score = 0
	if (resultTrackName === expectedTrackName) score += 8
	else if (
		resultTrackName.includes(expectedTrackName) ||
		expectedTrackName.includes(resultTrackName)
	)
		score += 4

	if (expectedArtistName && resultArtistName === expectedArtistName) score += 5
	else if (
		expectedArtistName &&
		(resultArtistName.includes(expectedArtistName) ||
			expectedArtistName.includes(resultArtistName))
	)
		score += 2

	if (expectedAlbumName && resultAlbumName === expectedAlbumName) score += 3
	if (data.duration)
		score += Math.max(
			0,
			LRCLIB_DURATION_TOLERANCE_SECONDS - Math.abs(data.duration - durationSeconds),
		)
	return score
}

const normalizeSearchText = (value: string): string =>
	value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/['']/g, '')
		.replace(/&/g, ' and ')
		.replace(/\b(feat|ft|featuring)\.?\b/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()

const fetchAdiLyrics = async (
	track: TrackData,
	signal: AbortSignal,
): Promise<SyncedLyricsResult> => {
	try {
		const searchUrl = new URL('https://lyrics.imreallyadi.space/api/search')
		searchUrl.searchParams.set('q', `${track.name} ${formatArtists(track.artists)}`)
		const searchResponse = await fetch(searchUrl, { signal })
		if (!searchResponse.ok) return { status: 'not-found' }

		const searchData = await searchResponse.json()
		if (!searchData.ok || !Array.isArray(searchData.results) || searchData.results.length === 0) {
			return { status: 'not-found' }
		}

		// Find the best match or take the first
		const bestMatch = searchData.results[0]
		if (!bestMatch || !bestMatch.id) return { status: 'not-found' }

		// Fetch lyric details
		const lyricUrl = `https://lyrics.imreallyadi.space/api/lyrics/${bestMatch.id}`
		const lyricResponse = await fetch(lyricUrl, { signal })
		if (!lyricResponse.ok) return { status: 'not-found' }

		const lyricData = await lyricResponse.json()
		if (!lyricData.ok || !lyricData.lyric || !lyricData.lyric.rawContent) {
			return { status: 'not-found' }
		}

		const rawLyrics = lyricData.lyric.rawContent
		const durationMs = getDurationSeconds(track) * 1000

		const parser = detectParser(rawLyrics)
		const parsed = parser.parse(rawLyrics, durationMs)

		if (parsed && parsed.length > 0) {
			const lines = mapBraccatoToSyncedLyrics(parsed)
			const hasWordTiming = parsed.some((lyric) => lyric.parts && lyric.parts.length > 0)
			return {
				status: 'found',
				source: 'adi',
				lines,
				syncType: hasWordTiming ? 'karaoke' : 'line',
			}
		}

		return { status: 'not-found' }
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		return { status: 'error' }
	}
}

const fetchBetterLyrics = async (
	track: TrackData,
	signal: AbortSignal,
): Promise<SyncedLyricsResult> => {
	try {
		const url = new URL('https://lyrics-api.boidu.dev/getLyrics')
		url.searchParams.set('s', track.name)
		url.searchParams.set('a', formatArtists(track.artists))

		const response = await fetch(url, { signal })
		if (!response.ok) return { status: 'not-found' }

		const data = await response.json()
		if (!data.ttml) return { status: 'not-found' }

		const rawLyrics = data.ttml
		const durationMs = getDurationSeconds(track) * 1000

		const parser = detectParser(rawLyrics)
		const parsed = parser.parse(rawLyrics, durationMs)

		if (parsed && parsed.length > 0) {
			const lines = mapBraccatoToSyncedLyrics(parsed)
			const hasWordTiming = parsed.some((lyric) => lyric.parts && lyric.parts.length > 0)
			return {
				status: 'found',
				source: 'better',
				lines,
				syncType: hasWordTiming ? 'karaoke' : 'line',
			}
		}

		return { status: 'not-found' }
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		return { status: 'error' }
	}
}

const normalizeWord = (value: unknown): SyncedLyricsWord | undefined => {
	if (!isRecord(value) || typeof value.string !== 'string' || !isFiniteNumber(value.time)) return
	return { string: value.string, time: value.time }
}

const normalizeLine = (value: unknown): SyncedLyricsLine | undefined => {
	if (!(isRecord(value) && isFiniteNumber(value.startTime) && isFiniteNumber(value.endTime)))
		return
	if (!Array.isArray(value.words)) return

	const words = value.words.map(normalizeWord).filter((word): word is SyncedLyricsWord => !!word)
	if (words.length === 0) return

	return { startTime: value.startTime, endTime: value.endTime, words }
}

const deduplicateLines = (lines: SyncedLyricsLine[]): SyncedLyricsLine[] => {
	return lines.filter((line, index, arr) => {
		if (index === 0) return true
		const prevLine = arr[index - 1]
		if (!prevLine) return true
		return !(
			line.startTime === prevLine.startTime &&
			line.words[0]?.string === prevLine.words[0]?.string
		)
	})
}

const getLyricsPlusResult = (
	data: unknown,
	durationSeconds: number,
): { lines: SyncedLyricsLine[]; syncType: LyricsSyncMode } | null => {
	if (!isRecord(data)) return null

	const syncTypeRaw = typeof data.type === 'string' ? data.type.toLowerCase() : ''
	const isLineSync = syncTypeRaw === 'line'

	if (Array.isArray(data.lines)) {
		const lines = data.lines
			.map(normalizeLine)
			.filter((line): line is SyncedLyricsLine => !!line)
		return { lines: deduplicateLines(lines), syncType: isLineSync ? 'line' : 'karaoke' }
	}

	if (Array.isArray(data.lyrics)) {
		if (isLineSync) {
			const lines = data.lyrics
				.map((line): SyncedLyricsLine | undefined => {
					if (
						!isRecord(line) ||
						typeof line.text !== 'string' ||
						!isFiniteNumber(line.time)
					)
						return

					const duration = isFiniteNumber(line.duration) ? line.duration : 2000
					const wordsList = line.text.split(/\s+/).filter(Boolean)

					return {
						startTime: line.time as number,
						endTime: (line.time as number) + duration,
						words: wordsList.map((word, i) => ({
							string: word + (i === wordsList.length - 1 ? '' : ' '),
							time: line.time as number,
						})),
					}
				})
				.filter((line): line is SyncedLyricsLine => !!line)

			return { lines: deduplicateLines(lines), syncType: 'line' }
		}

		// Words Sync Mode: parse via Braccato
		const lines = data.lyrics
			.map((line): SyncedLyricsLine | undefined => {
				if (
					!isRecord(line) ||
					typeof line.text !== 'string' ||
					!isFiniteNumber(line.time) ||
					!isFiniteNumber(line.duration)
				)
					return

				if (Array.isArray(line.syllabus)) {
					const words = line.syllabus
						.map((syl) => {
							if (
								!isRecord(syl) ||
								typeof syl.text !== 'string' ||
								!isFiniteNumber(syl.time)
							)
								return null
							return {
								string: syl.text,
								time: syl.time,
							}
						})
						.filter((w): w is SyncedLyricsWord => w !== null)

					if (words.length > 0) {
						return {
							startTime: line.time,
							endTime: line.time + (line.duration as number),
							words,
						}
					}
				}

				const wordsList = line.text.split(/\s+/).filter(Boolean)
				return {
					startTime: line.time as number,
					endTime: (line.time as number) + (line.duration as number),
					words: wordsList.map((word, i) => ({
						string: word + (i === wordsList.length - 1 ? '' : ' '),
						time: line.time as number,
					})),
				}
			})
			.filter((line): line is SyncedLyricsLine => !!line)

		return { lines: deduplicateLines(lines), syncType: 'karaoke' }
	}

	const lyricsText =
		typeof data.syncedLyrics === 'string'
			? data.syncedLyrics
			: typeof data.lyrics === 'string'
				? data.lyrics
				: null
	if (lyricsText) return { lines: parseLrc(lyricsText, durationSeconds * 1000), syncType: 'line' }

	if (isRecord(data.data)) return getLyricsPlusResult(data.data, durationSeconds)

	return null
}

const fetchLyricsPlusLyrics = async (
	track: TrackData,
	signal: AbortSignal,
): Promise<{ lines: SyncedLyricsLine[]; syncType: LyricsSyncMode } | null> => {
	const sources = ['apple', 'musixmatch']

	for (const source of sources) {
		try {
			const url = new URL(LYRICSPLUS_LYRICS_ENDPOINT)
			url.searchParams.set('title', track.name)
			url.searchParams.set('artist', formatArtists(track.artists))
			url.searchParams.set('source', source)

			const maybeIsrc = (track as { isrc?: unknown }).isrc
			if (typeof maybeIsrc === 'string' && maybeIsrc.trim()) {
				url.searchParams.set('isrc', maybeIsrc)
			}

			const response = await fetch(url, { signal })
			if (!response.ok) continue

			const result = getLyricsPlusResult(await response.json(), getDurationSeconds(track))
			if (result && result.lines.length > 0) {
				return result
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') throw error
		}
	}

	return null
}

const fetchLrclibExactLyrics = async (
	track: TrackData,
	durationSeconds: number,
	signal: AbortSignal,
): Promise<SyncedLyricsResult> => {
	const url = new URL(LRCLIB_GET_ENDPOINT)
	url.searchParams.set('track_name', track.name)
	url.searchParams.set('artist_name', formatArtists(track.artists) as any)
	url.searchParams.set('album_name', formatNameOrUnknown(track.album, '' as any) as any)
	url.searchParams.set('duration', String(durationSeconds))

	const response = await fetch(url, { signal })
	if (response.status === 404) return { status: 'not-found' }
	if (!response.ok) return { status: 'error' }

	const data = getLrclibResponse(await response.json())
	return data ? getLrclibFoundResult(data, durationSeconds) : { status: 'not-found' }
}

const fetchLrclibSearchLyrics = async (
	track: TrackData,
	durationSeconds: number,
	signal: AbortSignal,
): Promise<SyncedLyricsResult> => {
	const url = new URL(LRCLIB_SEARCH_ENDPOINT)
	url.searchParams.set('track_name', track.name)
	url.searchParams.set('artist_name', formatArtists(track.artists) as any)
	url.searchParams.set('duration', String(durationSeconds))

	const response = await fetch(url, { signal })
	if (response.status === 404) return { status: 'not-found' }
	if (!response.ok) return { status: 'error' }

	const data: unknown = await response.json()
	if (!Array.isArray(data)) return { status: 'not-found' }

	const bestMatch = data
		.map(getLrclibResponse)
		.filter((item): item is LrclibLyricsResponse => !!item)
		.map((item) => ({ item, score: scoreLrclibSearchResult(item, track, durationSeconds) }))
		.filter(({ score }) => Number.isFinite(score))
		.sort((a, b) => b.score - a.score)[0]?.item

	if (!bestMatch) return { status: 'not-found' }
	return getLrclibFoundResult(bestMatch, durationSeconds)
}

const fetchLrclibLyrics = async (
	track: TrackData,
	signal: AbortSignal,
): Promise<SyncedLyricsResult> => {
	const durationSeconds = getDurationSeconds(track)
	try {
		const exactResult = await fetchLrclibExactLyrics(track, durationSeconds, signal)
		if (exactResult.status === 'found' || exactResult.status === 'instrumental')
			return exactResult
		return await fetchLrclibSearchLyrics(track, durationSeconds, signal)
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		return { status: 'error' }
	}
}

const fetchUnisonLyrics = async (
	track: TrackData,
	signal: AbortSignal,
): Promise<SyncedLyricsResult> => {
	try {
		const url = new URL(UNISON_GET_ENDPOINT)
		url.searchParams.set('song', track.name)
		url.searchParams.set('artist', formatArtists(track.artists) as any)
		url.searchParams.set('album', formatNameOrUnknown(track.album, '' as any) as any)
		url.searchParams.set('duration', String(getDurationSeconds(track)))

		const response = await fetch(url, { signal })
		if (!response.ok) return { status: 'not-found' }

		const payload = (await response.json()) as UnisonLyricsResponse
		if (!(payload.success && payload.data?.lyrics)) return { status: 'not-found' }

		const rawLyrics = payload.data.lyrics
		const durationMs = getDurationSeconds(track) * 1000
		const parser = detectParser(rawLyrics)
		const parsed = parser.parse(rawLyrics, durationMs)
		const lines = mapBraccatoToSyncedLyrics(parsed)
		const hasWordTiming = parsed.some((lyric) => lyric.parts && lyric.parts.length > 0)

		if (lines.length > 0) {
			return {
				status: 'found',
				source: 'unison',
				lines,
				syncType: hasWordTiming ? 'karaoke' : 'line',
			}
		}

		return { status: 'not-found' }
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		return { status: 'error' }
	}
}

const getLyricsFromCache = async (trackId: number): Promise<SyncedLyricsResult | undefined> => {
	try {
		const db = await getDatabase()
		const cached = await db.get('lyrics', trackId)

		if (
			!cached ||
			!(cached as any).version ||
			(cached as any).version !== CACHE_VERSION ||
			Date.now() - cached.cachedAt > CACHE_TTL_MS
		) {
			return undefined
		}

		return cached.data
	} catch {
		return undefined
	}
}

const saveLyricsToCache = async (trackId: number, data: SyncedLyricsResult) => {
	try {
		const db = await getDatabase()
		await db.put('lyrics', { trackId, data, version: CACHE_VERSION, cachedAt: Date.now() } as any)
	} catch {}
}

export const fetchSyncedLyrics = async (
	track: TrackData,
	signal: AbortSignal,
): Promise<SyncedLyricsResult> => {
	const cachedResult = await getLyricsFromCache(track.id)

	if (cachedResult && cachedResult.status === 'found') {
		return cachedResult
	}

	try {
		let result: SyncedLyricsResult = { status: 'not-found' }

		// 1. Adi Lyrics API (Primary)
		result = await fetchAdiLyrics(track, signal)

		// 2. Better Lyrics API (Secondary Fallback)
		if (result.status !== 'found' && result.status !== 'instrumental') {
			result = await fetchBetterLyrics(track, signal)
		}

		// 3. LRCLib (Tertiary Fallback)
		if (result.status !== 'found' && result.status !== 'instrumental') {
			result = await fetchLrclibLyrics(track, signal)
		}

		// 4. LyricsPlus (Fallback)
		if (result.status !== 'found' && result.status !== 'instrumental') {
			const lyricsPlusData = await fetchLyricsPlusLyrics(track, signal)
			if (lyricsPlusData && lyricsPlusData.lines.length > 0) {
				result = {
					status: 'found',
					source: 'lyricsplus',
					lines: lyricsPlusData.lines,
					syncType: lyricsPlusData.syncType,
				}
			}
		}

		// 5. Unison (Fallback)
		if (result.status !== 'found' && result.status !== 'instrumental') {
			result = await fetchUnisonLyrics(track, signal)
		}

		if (result.status !== 'error') await saveLyricsToCache(track.id, result)
		return result
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		return { status: 'error' }
	}
}
