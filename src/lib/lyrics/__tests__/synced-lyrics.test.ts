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
		const fetchMock = vi.fn<typeof fetch>((input) => {
			const urlStr = String(input)
			if (urlStr.includes('lyricsplus.prjktla.workers.dev')) {
				return Promise.resolve(
					jsonResponse({
						syncedLyrics: '[00:01.00]First line\n[00:02.00]Second line',
					}),
				)
			}
			return Promise.resolve(new Response(null, { status: 404 }))
		})
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

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
		const fetchMock = vi.fn<typeof fetch>((input) => {
			const urlStr = String(input)
			if (urlStr.includes('/api/search')) {
				return Promise.resolve(
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
			}
			return Promise.resolve(new Response(null, { status: 404 }))
		})
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

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
		const fetchMock = vi.fn<typeof fetch>((input) => {
			const urlStr = String(input)
			if (urlStr.includes('/api/search')) {
				return Promise.resolve(
					jsonResponse([
						{
							trackName: 'Drowning - Avicii Remix',
							artistName: 'Armin van Buuren feat. Laura V',
							duration: 300,
							syncedLyrics: '[00:01.00]Wrong version',
						},
					]),
				)
			}
			return Promise.resolve(new Response(null, { status: 404 }))
		})
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('not-found')
	})

	it('falls back to LRCLIB search when exact lookup errors', async () => {
		const fetchMock = vi.fn<typeof fetch>((input) => {
			const urlStr = String(input)
			if (urlStr.includes('/api/get')) {
				return Promise.resolve(new Response(null, { status: 500 }))
			}
			if (urlStr.includes('/api/search')) {
				return Promise.resolve(
					jsonResponse([
						{
							trackName: 'Drowning - Avicii Remix',
							artistName: 'Armin van Buuren feat. Laura V',
							duration: 472,
							syncedLyrics: '[00:01.00]First line\n[00:02.00]Second line',
						},
					]),
				)
			}
			return Promise.resolve(new Response(null, { status: 404 }))
		})
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

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

	it('fetches successfully from Adi Lyrics API (Primary)', async () => {
		const fetchMock = vi.fn<typeof fetch>((input) => {
			const urlStr = String(input)
			if (urlStr.includes('lyrics.imreallyadi.space/api/search')) {
				return Promise.resolve(
					jsonResponse({
						ok: true,
						results: [
							{
								id: '12345',
								title: 'Drowning (Avicii Remix)',
								artists: ['Armin van Buuren', 'Laura V'],
							},
						],
					}),
				)
			}
			if (urlStr.includes('lyrics.imreallyadi.space/api/lyrics/12345')) {
				return Promise.resolve(
					jsonResponse({
						ok: true,
						lyric: {
							format: 'ttml',
							rawContent: `<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en"><body><div><p begin="00:01.00" end="00:03.00"><span begin="00:01.00" end="00:02.00">Hello</span> <span begin="00:02.00" end="00:03.00">world</span></p></div></body></tt>`,
						},
					}),
				)
			}
			return Promise.resolve(new Response(null, { status: 404 }))
		})
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found') return
		expect(result.source).toBe('adi')
		expect(result.syncType).toBe('karaoke')
		expect(result.lines[0]?.words[0]?.string).toBe('Hello ')
		expect(result.lines[0]?.words[1]?.string).toBe('world')
	})

	it('fetches successfully from Better Lyrics API (Secondary)', async () => {
		const fetchMock = vi.fn<typeof fetch>((input) => {
			const urlStr = String(input)
			if (urlStr.includes('lyrics-api.boidu.dev/getLyrics')) {
				return Promise.resolve(
					jsonResponse({
						ttml: `<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en"><body><div><p begin="00:01.00" end="00:03.00"><span begin="00:01.00" end="00:02.00">Better</span> <span begin="00:02.00" end="00:03.00">lyrics</span></p></div></body></tt>`,
					}),
				)
			}
			return Promise.resolve(new Response(null, { status: 404 }))
		})
		vi.stubGlobal('fetch', fetchMock)

		const result = await fetchSyncedLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found') return
		expect(result.source).toBe('better')
		expect(result.syncType).toBe('karaoke')
		expect(result.lines[0]?.words[0]?.string).toBe('Better ')
	})
})
