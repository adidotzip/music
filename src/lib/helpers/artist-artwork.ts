import { UNKNOWN_ITEM } from '$lib/library/types.ts'
import { SerialQueue } from './serial-queue.ts'

const queue = new SerialQueue()

const NONE_CACHE_DURATION = 1000 * 60 * 30 // 30 mins

const AUDIO_DB_API = 'https://www.theaudiodb.com/api/v1/json/2/search.php'

const pendingRequests = new Map<string, Promise<string | undefined>>()

const getStorageKey = (artist: string) => `snaeplayer-artist-artwork.${artist}`

// --------------------
// Types
// --------------------

interface AudioDBArtist {
	idArtist?: string
	strArtist?: string
	strArtistThumb?: string
	strArtistLogo?: string
	strArtistFanart?: string
	strArtistFanart2?: string
	strArtistFanart3?: string
	strArtistBanner?: string
}

interface AudioDBResponse {
	artists: AudioDBArtist[] | null
}

type CachedArtwork =
	| { type: 'image'; value: string; timestamp: number }
	| { type: 'none'; timestamp: number }

// --------------------
// Storage
// --------------------

const safeSetStorage = (key: string, value: CachedArtwork) => {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch (error) {
		console.warn(`[Storage Warning] Failed to cache ${key}`, error)
	}
}

const safeGetStorage = (key: string): CachedArtwork | null => {
	try {
		const raw = localStorage.getItem(key)

		if (!raw) {
			return null
		}

		return JSON.parse(raw) as CachedArtwork
	} catch {
		return null
	}
}

// --------------------
// Helpers
// --------------------

const normalize = (value: string) =>
	value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim()

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
	let lastError: unknown

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const controller = new AbortController()

			const timeout = setTimeout(() => {
				controller.abort()
			}, 8000)

			try {
				const response = await fetch(url, {
					signal: controller.signal,
					headers: {
						Accept: 'application/json',
					},
				})

				if (response.ok) {
					return response
				}

				console.warn(`[Artwork] Attempt ${attempt + 1} failed with ${response.status}`)
			} finally {
				clearTimeout(timeout)
			}
		} catch (error) {
			lastError = error

			console.warn(`[Artwork] Retry ${attempt + 1} failed`, error)
		}

		if (attempt < retries) {
			await delay(500 * (attempt + 1))
		}
	}

	throw lastError ?? new Error('Unknown fetch failure')
}

const resolveBestMatch = (artists: AudioDBArtist[], query: string): AudioDBArtist | undefined => {
	const needle = normalize(query)

	return artists.find((artist) => normalize(artist.strArtist ?? '') === needle) ?? artists[0]
}

/**
 * Prioritizes proper artist profile pictures first,
 * falls back to fanart/banner.
 */
const resolveBestArtwork = (artist: AudioDBArtist): string | undefined =>
	artist.strArtistThumb ||
	artist.strArtistFanart ||
	artist.strArtistFanart2 ||
	artist.strArtistFanart3 ||
	artist.strArtistBanner ||
	artist.strArtistLogo ||
	undefined

// --------------------
// Main
// --------------------

export const getArtistArtwork = async (artist: string): Promise<string | undefined> => {
	if (!artist || artist === UNKNOWN_ITEM) {
		return undefined
	}

	const key = getStorageKey(artist)

	// Cache lookup
	const cached = safeGetStorage(key)

	if (cached) {
		if (cached.type === 'image') {
			return cached.value
		}

		if (cached.type === 'none' && Date.now() - cached.timestamp < NONE_CACHE_DURATION) {
			return undefined
		}
	}

	// Deduplicate requests
	const pending = pendingRequests.get(artist)

	if (pending) {
		return pending
	}

	const request = (async () => {
		try {
			return await queue.enqueue(async () => {
				// Recheck cache after queue wait
				const cachedAgain = safeGetStorage(key)

				if (cachedAgain) {
					if (cachedAgain.type === 'image') {
						return cachedAgain.value
					}

					if (
						cachedAgain.type === 'none' &&
						Date.now() - cachedAgain.timestamp < NONE_CACHE_DURATION
					) {
						return undefined
					}
				}

				try {
					const response = await fetchWithRetry(
						`${AUDIO_DB_API}?s=${encodeURIComponent(artist)}`,
					)

					const payload = (await response.json()) as AudioDBResponse

					if (!Array.isArray(payload?.artists)) {
						safeSetStorage(key, {
							type: 'none',
							timestamp: Date.now(),
						})

						return undefined
					}

					const match = resolveBestMatch(payload.artists, artist)

					if (!match) {
						safeSetStorage(key, {
							type: 'none',
							timestamp: Date.now(),
						})

						return undefined
					}

					const artwork = resolveBestArtwork(match)

					if (artwork) {
						safeSetStorage(key, {
							type: 'image',
							value: artwork,
							timestamp: Date.now(),
						})

						return artwork
					}
				} catch (error) {
					console.error(`[Artwork] Failed loading artwork for "${artist}"`, error)
				}

				safeSetStorage(key, {
					type: 'none',
					timestamp: Date.now(),
				})

				return undefined
			})
		} finally {
			pendingRequests.delete(artist)
		}
	})()

	pendingRequests.set(artist, request)

	return request
}
