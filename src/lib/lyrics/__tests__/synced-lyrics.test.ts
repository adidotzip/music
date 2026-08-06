import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackData } from '$lib/library/get/value-queries.ts'
import { UNKNOWN_ITEM } from '$lib/library/types.ts'
import { LyricsService } from '../LyricsService.ts'
import { LyricsParser } from '../LyricsParser.ts'

const createTrack = (overrides: Partial<TrackData> = {}): TrackData => ({
	id: 1,
	type: 'track',
	favorite: false,
	uuid: 'track-uuid',
	name: 'Drowning (Avicii Remix)',
	album: 'A State Of Trance Classics 14',
	artists: ['Armin van Buuren', 'Laura V'],
	year: UNKNOWN_ITEM,
	duration: 473,
	genre: [],
	trackNo: 0,
	trackOf: 0,
	discNo: 0,
	discOf: 0,
	fileName: 'drowning.mp3',
	directory: -1,
	scannedAt: 1,
	file: new File(['audio'], 'drowning.mp3', { type: 'audio/mpeg' }),
	...overrides,
})

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init,
	})

describe('Braccato Lyrics System', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('should parse lyrics correctly using Braccato detectParser', () => {
		const rawLyrics = '[00:01.00]Hello\n[00:02.00]World'
		const lyrics = LyricsParser.parse(rawLyrics, 10_000)

		expect(lyrics).toBeDefined()
		expect(lyrics.length).toBeGreaterThan(0)
		expect(lyrics[0]?.words).toBe('Hello')
	})

	it('prefers Adi Lyrics QRC when available', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					results: [{ id: '123' }]
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					lyric: {
						format: 'qrc',
						rawContent: '[1000,1000]First(1000,500) (0,0)line(1500,500)\n[2000,1000]Second(2000,500) (0,0)line(2500,500)'
					}
				})
			)

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found' || !result.lyrics) {
			throw new Error('Expected found with lyrics')
		}
		expect(result.source).toBe('adi')
		expect(result.syncType).toBe('karaoke')
		expect(result.lyrics[0]?.words).toBe('First line')
	})

	it('falls back to LRCLIB when Adi Lyrics fails or has no match', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					results: []
				})
			) // Adi search returns no match
			.mockResolvedValueOnce(
				jsonResponse({
					syncedLyrics: '[00:01.00]LRCLib Line 1\n[00:02.00]LRCLib Line 2'
				})
			) // LRCLib exact fetch

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found' || !result.lyrics) {
			throw new Error('Expected found with lyrics')
		}
		expect(result.source).toBe('lrclib')
		expect(result.lyrics[0]?.words).toBe('LRCLib Line 1')
	})

	it('falls back to plain lyrics when no synchronized lyrics are found', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					results: [{ id: '123' }]
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					lyric: {
						lyrics: 'Plain lyric line 1\nPlain lyric line 2'
					}
				})
			) // Adi returns plain lyrics
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // LRCLib exact returns 404
			.mockResolvedValueOnce(jsonResponse([])) // LRCLib search returns empty

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found' || !result.lyrics) {
			throw new Error('Expected found with lyrics')
		}
		expect(result.source).toBe('plain')
		expect(result.syncType).toBe('plain')
		expect(result.lyrics[0]?.words).toBe('Plain lyric line 1')
	})
})
