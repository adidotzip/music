import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackData } from '$lib/library/get/value.ts'
import { UNKNOWN_ITEM } from '$lib/library/types.ts'
import { fetchSyncedLyrics, parseLrc } from '../synced-lyrics.ts'

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

describe('synced lyrics', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('parses multiple LRC timestamps on one line', () => {
		const lines = parseLrc('[00:01.50][00:03.00]Hello world\n[00:05.00]Again', 10_000)

		expect(lines).toHaveLength(3)
		expect(lines[0]?.startTime).toBe(1500)
		expect(lines[1]?.startTime).toBe(3000)
		expect(lines[0]?.words.map((word) => word.string).join('')).toBe('Hello world')
	})

	it('prefers LyricsPlus endpoint when available', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
			jsonResponse({
				syncedLyrics: '[00:01.00]First line\n[00:02.00]Second line',
			}),
		)
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
		expect(requestUrl.hostname).toBe('lyricsplus.prjktla.workers.dev')
		expect(requestUrl.pathname).toBe('/v2/lyrics/get')
		expect(requestUrl.searchParams.get('title')).toBe('Drowning (Avicii Remix)')
		expect(requestUrl.searchParams.get('artist')).toBe('Armin van Buuren, Laura V')
		expect(requestUrl.searchParams.get('source')).toBe('apple')
		expect(result.status).toBe('found')
		if (result.status !== 'found') {
			return
		}
		expect(result.source).toBe('lyricsplus')
		expect(result.lines.map((line) => line.words.map((word) => word.string).join(''))).toEqual([
			'First line',
			'Second line',
		])
	})

	it('falls back to LRCLIB search when exact lookup misses matching synced lyrics', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(
				jsonResponse([
					{
						trackName: 'Drowning - Avicii Remix',
						artistName: 'Armin van Buuren feat. Laura V',
						albumName: 'Mirage (The Remixes) [Bonus Tracks Edition]',
						duration: 472,
						syncedLyrics: '[00:01.00]First line\n[00:02.00]Second line',
					},
				]),
			)
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/api/search')
		expect(result.status).toBe('found')
		if (result.status !== 'found') {
			return
		}
		expect(result.source).toBe('lrclib')
		expect(result.lines.map((line) => line.words.map((word) => word.string).join(''))).toEqual([
			'First line',
			'Second line',
		])
	})

	it('ignores search results with mismatched durations', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(
				jsonResponse([
					{
						trackName: 'Drowning - Avicii Remix',
						artistName: 'Armin van Buuren feat. Laura V',
						duration: 300,
						syncedLyrics: '[00:01.00]Wrong version',
					},
				]),
			)
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('not-found')
	})

	it('falls back to LRCLIB search when exact lookup errors', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValueOnce(
				jsonResponse([
					{
						trackName: 'Drowning - Avicii Remix',
						artistName: 'Armin van Buuren feat. Laura V',
						duration: 472,
						syncedLyrics: '[00:01.00]First line\n[00:02.00]Second line',
					},
				]),
			)
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/api/search')
		expect(result.status).toBe('found')
		if (result.status !== 'found') {
			return
		}
		expect(result.source).toBe('lrclib')
		expect(result.lines.map((line) => line.words.map((word) => word.string).join(''))).toEqual([
			'First line',
			'Second line',
		])
	})
})
