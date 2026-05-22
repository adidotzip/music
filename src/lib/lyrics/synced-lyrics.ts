import { getDatabase } from '$lib/db/database.ts'
import { formatArtists, formatNameOrUnknown } from '$lib/helpers/utils/text.ts'
import type { TrackData } from '$lib/library/get/value.ts'

const LYRICSPLUS_LYRICS_ENDPOINT =
	'https://lyricsplus.prjktla.workers.dev/v2/lyrics/get'

const LRCLIB_GET_ENDPOINT = 'https://lrclib.net/api/get'
const LRCLIB_SEARCH_ENDPOINT = 'https://lrclib.net/api/search'

const UNISON_GET_ENDPOINT = 'https://unison.boidu.dev/lyrics'

const LRCLIB_DURATION_TOLERANCE_SECONDS = 4
const SLOW_PACED_BPM_THRESHOLD = 80

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7
const CACHE_VERSION = 9 // Bumped to invalidate old caches and apply punctuation pauses

export interface SyncedLyricsWord {
	string: string
	time: number
}

export interface SyncedLyricsLine {
	startTime: number
	endTime: number
	words: SyncedLyricsWord[]
}

export type SyncedLyricsSource = 'lyricsplus' | 'lrclib' | 'unison'

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

const deduplicateLines = (lines: SyncedLyricsLine[]): SyncedLyricsLine[] => {
	return lines.filter((line, index, arr) => {
		if (index === 0) return true
		const prevLine = arr[index - 1]
		// Drop if it starts at the exact same time and has the identical starting word
		return !(
			line.startTime === prevLine.startTime &&
			line.words[0]?.string === prevLine.words[0]?.string
		)
	})
}

const getLyricsSyncMode = (
	track: TrackData,
	result: SyncedLyricsResult,
): LyricsSyncMode => {
	const bpm = (track as { bpm?: number }).bpm

	// ABSOLUTE OVERRIDE: Line-only for slow songs (prevents jittery karaoke on emotional tracks)
	if (bpm !== undefined && bpm < SLOW_PACED_BPM_THRESHOLD) {
		return 'line'
	}

	return 'karaoke'
}

// Only needed for real word-timed sources that need BPM flattening.
const convertToLineOnly = (
	lines: SyncedLyricsLine[],
): SyncedLyricsLine[] => {
	return lines.map((line) => ({
		...line,
		words: line.words.map((word) => ({
			...word,
			time: line.startTime,
		})),
	}))
}

const normalizeWord = (value: unknown): SyncedLyricsWord | undefined => {
	if (!isRecord(value) || typeof value.string !== 'string' || !isFiniteNumber(value.time)) return
	return { string: value.string, time: value.time }
}

const normalizeLine = (value: unknown): SyncedLyricsLine | undefined => {
	if (!(isRecord(value) && isFiniteNumber(value.startTime) && isFiniteNumber(value.endTime))) return
	if (!Array.isArray(value.words)) return

	const words = value.words.map(normalizeWord).filter((word): word is SyncedLyricsWord => !!word)
	if (words.length === 0) return

	return { startTime: value.startTime, endTime: value.endTime, words }
}

const timestampPattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g
const whitespacePattern = /\s+/

const parseTimestamp = (minutes: string, seconds: string, fraction: string | undefined): number => {
	const msString = (fraction ?? '0').padEnd(3, '0').slice(0, 3)
	return Number.parseInt(minutes, 10) * 60_000 + Number.parseInt(seconds, 10) * 1000 + Number.parseInt(msString, 10)
}

export const parseLrc = (lyrics: string, durationMs: number): SyncedLyricsLine[] => {
	const timestampedLines = lyrics
		.split('\n')
		.flatMap((rawLine) => {
			const matches = [...rawLine.matchAll(timestampPattern)]
			if (matches.length === 0) return []
			const text = rawLine.replace(timestampPattern, '').trim()
			if (!text) return []
			return matches.map((match) => ({
				startTime: parseTimestamp(match[1], match[2], match[3] as string | undefined),
				text,
			}))
		})
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
				time: line.startTime, // all words share the line timestamp — no fake karaoke
			})),
		}
	})

	return deduplicateLines(lines)
}

export const parseTtml = (ttml: string): SyncedLyricsLine[] => {
	const lines: SyncedLyricsLine[] = []
	const parser = new DOMParser()
	const doc = parser.parseFromString(ttml, 'text/xml')

	const parseTime = (timeStr: string | null): number => {
		if (!timeStr) return 0
		const parts = timeStr.split(':')
		if (parts.length === 3) return ((Number.parseInt(parts[0], 10) * 3600 + Number.parseInt(parts[1], 10) * 60 + Number.parseFloat(parts[2])) * 1000)
		if (parts.length === 2) return ((Number.parseInt(parts[0], 10) * 60 + Number.parseFloat(parts[1])) * 1000)
		return Number.parseFloat(timeStr) * 1000
	}

	const paragraphs = doc.querySelectorAll('p')
	paragraphs.forEach((p) => {
		const startTime = parseTime(p.getAttribute('begin'))
		const endTime = parseTime(p.getAttribute('end'))
		const spans = p.querySelectorAll('span')
		const words: SyncedLyricsWord[] = []

		if (spans.length > 0) {
			spans.forEach((span) => {
				words.push({
					string: (span.textContent || '').trim() + ' ',
					time: parseTime(span.getAttribute('begin'))
				})
			})
		} else {
			const content = p.textContent || ''
			if (content.trim()) {
				words.push({ string: content.trim(), time: startTime })
			}
		}

		if (words.length > 0) {
			lines.push({ startTime, endTime, words })
		}
	})

	return deduplicateLines(lines)
}

const normalizeSearchText = (value: string): string =>
	value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['']/g, '').replace(/&/g, ' and ').replace(/\b(feat|ft|featuring)\.?\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

const getDurationSeconds = (track: TrackData): number => Math.round(track.duration)

const isDurationClose = (actualDuration: number | undefined, expectedDuration: number): boolean =>
	!(actualDuration && expectedDuration) || Math.abs(Math.round(actualDuration) - expectedDuration) <= LRCLIB_DURATION_TOLERANCE_SECONDS

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

const getLrclibFoundResult = (data: LrclibLyricsResponse, durationSeconds: number): SyncedLyricsResult => {
	if (data.instrumental) return { status: 'instrumental' }
	if (!data.syncedLyrics) return { status: 'not-found' }

	const lines = parseLrc(data.syncedLyrics, durationSeconds * 1000)
	return lines.length > 0
		? { status: 'found', source: 'lrclib', lines, syncType: 'line' }
		: { status: 'not-found' }
}

const scoreLrclibSearchResult = (data: LrclibLyricsResponse, track: TrackData, durationSeconds: number): number => {
	if (!(data.syncedLyrics && isDurationClose(data.duration, durationSeconds))) return Number.NEGATIVE_INFINITY

	const expectedTrackName = normalizeSearchText(track.name)
	const expectedArtistName = normalizeSearchText(formatArtists(track.artists))
	const expectedAlbumName = normalizeSearchText(formatNameOrUnknown(track.album, ''))
	const resultTrackName = normalizeSearchText(data.trackName ?? '')
	const resultArtistName = normalizeSearchText(data.artistName ?? '')
	const resultAlbumName = normalizeSearchText(data.albumName ?? '')

	let score = 0
	if (resultTrackName === expectedTrackName) score += 8
	else if (resultTrackName.includes(expectedTrackName) || expectedTrackName.includes(resultTrackName)) score += 4

	if (expectedArtistName && resultArtistName === expectedArtistName) score += 5
	else if (expectedArtistName && (resultArtistName.includes(expectedArtistName) || expectedArtistName.includes(resultArtistName))) score += 2

	if (expectedAlbumName && resultAlbumName === expectedAlbumName) score += 3
	if (data.duration) score += Math.max(0, LRCLIB_DURATION_TOLERANCE_SECONDS - Math.abs(data.duration - durationSeconds))
	return score
}

const getWordWeight = (word: string): number => {
	const clean = word.toLowerCase()
	
	const pureText = clean.replace(/[^a-z0-9]/g, '')
	let weight = pureText.length

	const vowelMatches = clean.match(/[aeiouy]/g)
	if (vowelMatches) weight += vowelMatches.length * 1.8

	const repeatedVowels = clean.match(/([aeiouy])\1+/g)
	if (repeatedVowels) weight += repeatedVowels.length * 3

	if (/(ay|ee|oo|ah|oh|uh)[^a-z0-9]*$/i.test(clean)) weight += 2

	if (/^(a|an|the|to|of|in|on|at|it)$/i.test(pureText)) weight *= 0.6

	if (/,$/.test(clean)) weight += 4 
	else if (/[.!?;]$/.test(clean)) weight += 5 

	return Math.max(weight, 1)
}

const getLyricsPlusResult = (data: unknown, durationSeconds: number): { lines: SyncedLyricsLine[]; syncType: LyricsSyncMode } | null => {
	if (!isRecord(data)) return null

	// Explicit API type detection ('Line' or 'Word')
	const syncTypeRaw = typeof data.type === 'string' ? data.type.toLowerCase() : ''
	const isLineSync = syncTypeRaw === 'line'

	if (Array.isArray(data.lines)) {
		const lines = data.lines.map(normalizeLine).filter((line): line is SyncedLyricsLine => !!line)
		return { lines: deduplicateLines(lines), syncType: isLineSync ? 'line' : 'karaoke' }
	}

	if (Array.isArray(data.lyrics)) {
		if (isLineSync) {
			// STRICT LINE SYNC: Prevent word timeline interpolation entirely
			const lines = data.lyrics
				.map((line): SyncedLyricsLine | undefined => {
					if (!isRecord(line) || typeof line.text !== 'string' || !isFiniteNumber(line.time)) return
					
					const duration = isFiniteNumber(line.duration) ? line.duration : 2000
					const wordsList = line.text.split(whitespacePattern).filter(Boolean)
					
					return {
						startTime: line.time,
						endTime: line.time + duration,
						words: wordsList.map((word, i) => ({
							string: word + (i === wordsList.length - 1 ? '' : ' '),
							time: line.time, 
						})),
					}
				})
				.filter((line): line is SyncedLyricsLine => !!line)
			
			return { lines: deduplicateLines(lines), syncType: 'line' }
		} else {
			// WORD SYNC MODE: Map precise native timing profiles or gracefully fall back to interpolation
			const lines = data.lyrics
				.map((line): SyncedLyricsLine | undefined => {
					if (!isRecord(line) || typeof line.text !== 'string' || !isFiniteNumber(line.time) || !isFiniteNumber(line.duration)) return
					
					// 1. Check for native word-level mapping via 'syllabus' array
					if (Array.isArray(line.syllabus)) {
						const words = line.syllabus
							.map((syl) => {
								if (!isRecord(syl) || typeof syl.text !== 'string' || !isFiniteNumber(syl.time)) return null
								return {
									string: syl.text, // Contains native spacing spacing natively (e.g. "And ")
									time: syl.time
								}
							})
							.filter((w): w is SyncedLyricsWord => w !== null)

						if (words.length > 0) {
							return {
								startTime: line.time,
								endTime: line.time + line.duration,
								words
							}
						}
					}

					// 2. Fallback to vocal-weighted interpolation if 'syllabus' isn't structural or populated
					const wordsList = line.text.split(whitespacePattern).filter(Boolean)
					const totalWeight = wordsList.reduce((sum, word) => sum + getWordWeight(word), 0) || 1
					let currentWordTime = line.time
					
					return {
						startTime: line.time,
						endTime: line.time + line.duration,
						words: wordsList.map((word, i) => {
							const timeShare = (getWordWeight(word) / totalWeight) * line.duration
							const wordTimestamp = currentWordTime
							currentWordTime += timeShare
							return {
								string: word + (i === wordsList.length - 1 ? '' : ' '),
								time: wordTimestamp, 
							}
						}),
					}
				})
				.filter((line): line is SyncedLyricsLine => !!line)
			
			return { lines: deduplicateLines(lines), syncType: 'karaoke' }
		}
	}

	const lyricsText = typeof data.syncedLyrics === 'string' ? data.syncedLyrics : typeof data.lyrics === 'string' ? data.lyrics : null
	if (lyricsText) return { lines: parseLrc(lyricsText, durationSeconds * 1000), syncType: 'line' }
	
	if (isRecord(data.data)) return getLyricsPlusResult(data.data, durationSeconds)

	return null
}

const fetchLyricsPlusLyrics = async (
	track: TrackData,
	signal: AbortSignal
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

const fetchLrclibExactLyrics = async (track: TrackData, durationSeconds: number, signal: AbortSignal): Promise<SyncedLyricsResult> => {
	const url = new URL(LRCLIB_GET_ENDPOINT)
	url.searchParams.set('track_name', track.name)
	url.searchParams.set('artist_name', formatArtists(track.artists))
	url.searchParams.set('album_name', formatNameOrUnknown(track.album, ''))
	url.searchParams.set('duration', String(durationSeconds))

	const response = await fetch(url, { signal })
	if (response.status === 404) return { status: 'not-found' }
	if (!response.ok) return { status: 'error' }

	const data = getLrclibResponse(await response.json())
	return data ? getLrclibFoundResult(data, durationSeconds) : { status: 'not-found' }
}

const fetchLrclibSearchLyrics = async (track: TrackData, durationSeconds: number, signal: AbortSignal): Promise<SyncedLyricsResult> => {
	const url = new URL(LRCLIB_SEARCH_ENDPOINT)
	url.searchParams.set('track_name', track.name)
	url.searchParams.set('artist_name', formatArtists(track.artists))
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

const fetchLrclibLyrics = async (track: TrackData, signal: AbortSignal): Promise<SyncedLyricsResult> => {
	const durationSeconds = getDurationSeconds(track)
	try {
		const exactResult = await fetchLrclibExactLyrics(track, durationSeconds, signal)
		if (exactResult.status === 'found' || exactResult.status === 'instrumental') return exactResult
		return await fetchLrclibSearchLyrics(track, durationSeconds, signal)
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		return { status: 'error' }
	}
}

const fetchUnisonLyrics = async (track: TrackData, signal: AbortSignal): Promise<SyncedLyricsResult> => {
	try {
		const url = new URL(UNISON_GET_ENDPOINT)
		url.searchParams.set('song', track.name)
		url.searchParams.set('artist', formatArtists(track.artists))
		url.searchParams.set('album', formatNameOrUnknown(track.album, ''))
		url.searchParams.set('duration', String(getDurationSeconds(track)))

		const response = await fetch(url, { signal })
		if (!response.ok) return { status: 'not-found' }

		const payload = (await response.json()) as UnisonLyricsResponse
		if (!payload.success || !payload.data?.lyrics) return { status: 'not-found' }

		const isTtml = payload.data.lyrics.trim().startsWith('<tt')
		const lines = isTtml ? parseTtml(payload.data.lyrics) : parseLrc(payload.data.lyrics, getDurationSeconds(track) * 1000)

		if (lines.length > 0) {
			return {
				status: 'found',
				source: 'unison',
				lines,
				syncType: isTtml ? 'karaoke' : 'line'
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
		
		if (!cached || cached.version !== CACHE_VERSION || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
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
		await db.put('lyrics', { trackId, data, version: CACHE_VERSION, cachedAt: Date.now() })
	} catch { }
}

export const fetchSyncedLyrics = async (track: TrackData, signal: AbortSignal): Promise<SyncedLyricsResult> => {
	let cachedResult = await getLyricsFromCache(track.id)

	if (cachedResult && cachedResult.status === 'found') {
		const targetSyncMode = getLyricsSyncMode(track, cachedResult)
		if (targetSyncMode === 'line' && cachedResult.syncType !== 'line') {
			cachedResult = {
				...cachedResult,
				syncType: 'line',
				lines: convertToLineOnly(cachedResult.lines),
			}
		}
		return cachedResult
	}

	try {
		let result: SyncedLyricsResult = { status: 'not-found' }

		const bpm = (track as { bpm?: number }).bpm
		const isSlow = bpm !== undefined && bpm < SLOW_PACED_BPM_THRESHOLD

		// 1. LyricsPlus (Main Source)
		const lyricsPlusData = await fetchLyricsPlusLyrics(track, signal)
		if (lyricsPlusData && lyricsPlusData.lines.length > 0) {
			result = {
				status: 'found',
				source: 'lyricsplus',
				lines: lyricsPlusData.lines,
				syncType: lyricsPlusData.syncType
			}
		}

		// 2. Slow songs specific fallback: LRCLIB
		if (isSlow && result.status !== 'found' && result.status !== 'instrumental') {
			result = await fetchLrclibLyrics(track, signal)
		}

		// 3. Unison (Secondary fallback)
		if (result.status !== 'found' && result.status !== 'instrumental') {
			result = await fetchUnisonLyrics(track, signal)
		}

		// 4. Normal-paced general fallback: LRCLIB
		if (!isSlow && result.status !== 'found' && result.status !== 'instrumental') {
			result = await fetchLrclibLyrics(track, signal)
		}

		// Adaptive sync mode override
		if (result.status === 'found') {
			const targetSyncMode = getLyricsSyncMode(track, result)
			if (targetSyncMode === 'line' && result.syncType !== 'line') {
				result = {
					...result,
					syncType: 'line',
					lines: convertToLineOnly(result.lines),
				}
			} else if (!result.syncType) {
				result.syncType = targetSyncMode
			}
		}

		if (result.status !== 'error') await saveLyricsToCache(track.id, result)
		return result

	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		return { status: 'error' }
	}
}
