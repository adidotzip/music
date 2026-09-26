const ITUNES_API = 'https://itunes.apple.com'
const CACHE_TTL = 5 * 60_000
const JSONP_TIMEOUT = 12_000

type ItunesEntity = 'musicTrack' | 'album' | 'musicArtist' | 'song'

export interface ItunesResult {
	wrapperType?: string
	kind?: string
	artistId?: number
	collectionId?: number
	trackId?: number
	artistName?: string
	collectionName?: string
	trackName?: string
	collectionArtistName?: string
	artistViewUrl?: string
	collectionViewUrl?: string
	trackViewUrl?: string
	previewUrl?: string
	artworkUrl30?: string
	artworkUrl60?: string
	artworkUrl100?: string
	trackTimeMillis?: number
	trackNumber?: number
	trackCount?: number
	releaseDate?: string
	primaryGenreName?: string
	artistType?: string
	primaryGenreId?: number
	[key: string]: unknown
}

interface ItunesResponse {
	resultCount: number
	results: ItunesResult[]
}

const responseCache = new Map<string, { expiresAt: number; value: ItunesResponse }>()
const pendingRequests = new Map<string, Promise<ItunesResponse>>()
let callbackCounter = 0

const jsonp = <T>(url: URL, callbackName: string): Promise<T> => {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('iTunes search is only available in the browser.'))
	}

	return new Promise<T>((resolve, reject) => {
		const script = document.createElement('script')
		const callbacks = window as unknown as Record<string, (value: T) => void>
		let timeout = 0

		const cleanup = () => {
			window.clearTimeout(timeout)
			delete callbacks[callbackName]
			script.remove()
		}

		callbacks[callbackName] = (value) => {
			cleanup()
			resolve(value)
		}

		script.async = true
		script.src = url.toString()
		script.onerror = () => {
			cleanup()
			reject(new Error('Unable to reach the iTunes Search API.'))
		}

		timeout = window.setTimeout(() => {
			cleanup()
			reject(new Error('The iTunes Search API request timed out.'))
		}, JSONP_TIMEOUT)

		document.head.appendChild(script)
	})
}

const request = async (params: Record<string, string>): Promise<ItunesResponse> => {
	const url = new URL('/search', ITUNES_API)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

	const cacheKey = url.toString()
	const cached = responseCache.get(cacheKey)
	if (cached && cached.expiresAt > Date.now()) return cached.value
	if (cached) responseCache.delete(cacheKey)

	const pending = pendingRequests.get(cacheKey)
	if (pending) return pending

	const callbackName = '__adiMusicItunes_' + Date.now() + '_' + callbackCounter++
	url.searchParams.set('callback', callbackName)

	const promise = (async () => {
		// Apple documents JSONP for cross-site searches. This avoids relying on
		// browser CORS behavior and works with Adi Music's static adapter build.
		const value = await jsonp<ItunesResponse>(url, callbackName)
		responseCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL })
		return value
	})()

	pendingRequests.set(cacheKey, promise)
	try {
		return await promise
	} finally {
		pendingRequests.delete(cacheKey)
	}
}

export const searchItunes = async (
	term: string,
	entity: ItunesEntity,
	limit = 20,
): Promise<ItunesResult[]> => {
	const cleanTerm = term.trim()
	if (!cleanTerm) return []

	const response = await request({
		term: cleanTerm,
		country: 'US',
		media: 'music',
		entity,
		limit: String(Math.min(Math.max(1, limit), 50)),
		lang: 'en_us',
		version: '2',
		explicit: 'Yes',
	})

	return response.results.filter((result) => result && typeof result === 'object')
}

export const searchItunesSongs = async (term: string, limit = 20) => {
	const results = await searchItunes(term, 'musicTrack', limit)
	return results.filter((result) => result.kind === 'song')
}
export const searchItunesAlbums = (term: string, limit = 20) => searchItunes(term, 'album', limit)
export const searchItunesArtists = (term: string, limit = 20) => searchItunes(term, 'musicArtist', limit)

export const lookupItunes = async (id: string | number, entity?: ItunesEntity): Promise<ItunesResult[]> => {
	const url = new URL('/lookup', ITUNES_API)
	url.searchParams.set('id', String(id))
	url.searchParams.set('country', 'US')
	if (entity) url.searchParams.set('entity', entity)

	const callbackName = '__adiMusicItunes_' + Date.now() + '_' + callbackCounter++
	url.searchParams.set('callback', callbackName)
	const value = await jsonp<ItunesResponse>(url, callbackName)
	return value.results.filter((result) => result && typeof result === 'object')
}

export const itunesArtworkUrl = (url: unknown, size = 600): string => {
	if (typeof url !== 'string' || !url.trim()) return ''
	return url
		.trim()
		.replace(/^http:/i, 'https:')
		.replace(/\d+x\d+bb\./, size + 'x' + size + 'bb.')
}