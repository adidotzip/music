const API_BASE = 'https://api.spicyamll.online'

export type SpicyApiParams = Record<string, string | number | boolean | undefined | null>

export interface SpicyTrack {
	id: number
	name: string
	artist?: string
	artists?: string[]
	album?: string
	albumName?: string
	image?: string
	artwork?: string
	duration?: number
	year?: number | string
	[key: string]: unknown
}

const request = async <T>(path: string, params: SpicyApiParams = {}): Promise<T> => {
	const url = new URL(`${API_BASE}${path}`)
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== '') {
			url.searchParams.set(key, String(value))
		}
	}

 	try {
		const response = await fetch(url, { headers: { Accept: 'application/json' } })
		if (!response.ok) throw new Error(`SpicyAMLL ${response.status}: ${response.statusText}`)
		return response.json() as Promise<T>
	} catch (directError) {
		const proxy = new URL(`${API_BASE}/proxy`)
		proxy.searchParams.set('url', url.toString())
		try {
			const response = await fetch(proxy, { headers: { Accept: 'application/json' } })
			if (!response.ok) throw new Error(`SpicyAMLL proxy ${response.status}: ${response.statusText}`)
			return response.json() as Promise<T>
		} catch {
			throw directError
		}
	}
}

const unwrap = <T>(value: unknown): T => {
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>
		return (record.data ?? record.result ?? record.results ?? value) as T
	}
	return value as T
}

export const spicyamll = {
	search: (params: SpicyApiParams) => request<unknown>('/get/search', params).then(unwrap),
	artist: (params: SpicyApiParams) => request<unknown>('/get/artist', params).then(unwrap),
	album: (params: SpicyApiParams) => request<unknown>('/get/album', params).then(unwrap),
	playlist: (params: SpicyApiParams) => request<unknown>('/get/playlist', params).then(unwrap),
	musicVideo: (params: SpicyApiParams) => request<unknown>('/get/musicvideo', params).then(unwrap),
	musicVideoGet: (mvId: string | number) => request<unknown>('/get/musicvideo/get', { id: mvId }).then(unwrap),
	musicVideoById: (mvId: string | number) => request<unknown>(`/get/musicvideo/${encodeURIComponent(mvId)}`).then(unwrap),
	musicVideoDownload: (params: SpicyApiParams) => request<unknown>('/get/musicvideo/download', params).then(unwrap),
	musicVideoStream: (params: SpicyApiParams) => request<unknown>('/get/musicvideo/stream', params).then(unwrap),
	artistAlbums: (params: SpicyApiParams) => request<unknown>('/get/artist/albums', params).then(unwrap),
	artistSongs: (params: SpicyApiParams) => request<unknown>('/get/artist/songs', params).then(unwrap),
	downloadFormat: (fmt: string, params: SpicyApiParams) =>
		request<unknown>(`/get/download/${encodeURIComponent(fmt)}`, params).then(unwrap),
	songs: (id: string | number) => request<unknown>(`/get/songs/${encodeURIComponent(id)}`).then(unwrap),
	song: (id: string | number) => request<unknown>(`/get/song/${encodeURIComponent(id)}`).then(unwrap),
	lyrics: (params: SpicyApiParams) => request<unknown>('/get/lyrics', params).then(unwrap),
	download: (params: SpicyApiParams) => request<unknown>('/get/download', params).then(unwrap),
	getStream: (params: SpicyApiParams) => request<unknown>('/get/stream', params).then(unwrap),
	convert: (params: SpicyApiParams) => request<unknown>('/get/convert', params).then(unwrap),
	animatedArt: (params: SpicyApiParams) => request<unknown>('/get/animatedart', params).then(unwrap),

	streamUrl: (
		song: string | number,
		options: { codec?: string; fallback?: boolean; language?: string } = {},
	) => {
		const url = new URL(`${API_BASE}/stream`)
		url.searchParams.set('song', String(song))
		url.searchParams.set('codec', options.codec ?? 'aac')
		url.searchParams.set('fallback', String(options.fallback ?? true))
		url.searchParams.set('l', options.language ?? 'en-US')
		url.searchParams.set('websupport', 'true')
		return url.toString()
	},
}

export const normalizeTracks = (input: unknown): SpicyTrack[] => {
	const value = unwrap<unknown>(input)
	const array = Array.isArray(value)
		? value
		: value && typeof value === 'object'
			? ('id' in value || 'songId' in value || 'trackId' in value || 'musicId' in value || 'name' in value || 'title' in value)
				? [value]
				: Object.values(value as Record<string, unknown>).find(Array.isArray) ?? []
			: []

	return array
		.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
		.map((item, index) => ({
			...item,
			id: Number(item.id ?? item.songId ?? item.song_id ?? item.musicId ?? index),
			name: String(item.name ?? item.title ?? item.songName ?? 'Unknown'),
			artist: String(item.artist ?? item.artistName ?? ''),
			artists: Array.isArray(item.artists)
				? item.artists.map(String)
				: item.artist
					? [String(item.artist)]
					: item.artistName
						? [String(item.artistName)]
						: [],
			album: String(item.album ?? item.albumName ?? ''),
			albumName: String(item.albumName ?? item.album ?? ''),
			image: String(item.image ?? item.artwork ?? item.cover ?? item.coverUrl ?? ''),
			duration: Number(item.duration ?? item.durationSeconds ?? 0),
			year: item.year as string | number | undefined,
		}))
}

export const searchArtists = async (query: string) => {
	const candidates = [
		{ name: query },
		{ query },
		{ q: query },
		{ keyword: query },
	]
	for (const params of candidates) {
		try {
			const value = normalizeTracks(await spicyamll.artist(params))
			if (value.length) return value
		} catch {
			// Try the next documented/compatible query shape.
		}
	}
	return []
}

export const searchAlbums = async (query: string) => {
	const candidates = [{ name: query }, { query }, { q: query }, { keyword: query }]
	for (const params of candidates) {
		try {
			const value = normalizeTracks(await spicyamll.album(params))
			if (value.length) return value
		} catch {}
	}
	return []
}

export const getSongsForArtist = async (artistId: string | number, artistName?: string) => {
	const candidates = [
		{ id: artistId },
		{ artistId },
		{ artist_id: artistId },
		{ artist: artistId },
		...(artistName ? [{ name: artistName }, { artist: artistName }] : []),
	]
	for (const params of candidates) {
		try {
			const value = normalizeTracks(await spicyamll.artistSongs(params))
			if (value.length) return value
		} catch {}
	}
	return []
}

export const searchCatalog = async (query: string) => {
	const response = await spicyamll.search({
		term: query,
		q: query,
		query,
		l: 'en-US',
		limit: 25,
	})
	return normalizeTracks(response)
}
