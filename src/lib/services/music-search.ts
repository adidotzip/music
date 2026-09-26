import {
	searchItunesAlbums,
	searchItunesArtists,
	searchItunesSongs,
	type ItunesResult,
} from './itunes.ts'
import { normalizeTracks, searchCatalog, spicyamll, type DiscoveryResource, type SpicyTrack } from './spicyamll.ts'

const normalizeText = (value: unknown) =>
	String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()

const cleanArtwork = (url: unknown, size = 600) => {
	if (typeof url !== 'string' || !url.trim()) return ''
	return url
		.trim()
		.replace(/^http:/i, 'https:')
		.replace(/\{w\}/g, String(size))
		.replace(/\{h\}/g, String(size))
		.replace(/\{c\}/g, 'bb')
		.replace(/\{f\}/g, 'jpg')
		.replace(/\d+x\d+bb\./, size + 'x' + size + 'bb.')
}

const providerIdFromTrack = (track: SpicyTrack): string => String(track.id)

const providerAlbumIdFromTrack = (track: SpicyTrack): string | undefined => {
	const value =
		track.collectionId ??
		track.albumId ??
		track.album_id ??
		(track as Record<string, unknown>).collection?.id
	return value !== undefined && value !== null && value !== '' ? String(value) : undefined
}

const trackMatches = (itunes: ItunesResult, provider: SpicyTrack) => {
	const itunesName = normalizeText(itunes.trackName)
	const itunesArtist = normalizeText(itunes.artistName)
	const itunesAlbum = normalizeText(itunes.collectionName)
	const providerName = normalizeText(provider.name)
	const providerArtist = normalizeText(provider.artist ?? provider.artists?.[0])
	const providerAlbum = normalizeText(provider.albumName ?? provider.album)

	if (!itunesName || !providerName || itunesName !== providerName) return false
	if (itunesArtist && providerArtist && itunesArtist !== providerArtist) return false
	return !itunesAlbum || !providerAlbum || itunesAlbum === providerAlbum
}

const findProviderTrack = (itunes: ItunesResult, providers: SpicyTrack[]) => {
	const exact = providers.find((provider) => trackMatches(itunes, provider))
	if (exact) return exact

	const name = normalizeText(itunes.trackName)
	const artist = normalizeText(itunes.artistName)
	return providers.find((provider) => {
		if (normalizeText(provider.name) !== name) return false
		const providerArtist = normalizeText(provider.artist ?? provider.artists?.[0])
		return !artist || !providerArtist || providerArtist === artist
	})
}

const fallbackProviderTrack = async (itunes: ItunesResult): Promise<SpicyTrack | undefined> => {
	const term = [itunes.artistName, itunes.trackName].filter(Boolean).join(' ')
	if (!term) return undefined

	try {
		const response = await spicyamll.search({ term, limit: 10 })
		const candidates = normalizeTracks(response)
		return findProviderTrack(itunes, candidates)
	} catch {
		return undefined
	}
}

const toSongResource = (itunes: ItunesResult, provider?: SpicyTrack): DiscoveryResource => ({
	type: 'song',
	id: String(itunes.trackId ?? ''),
	providerId: provider ? providerIdFromTrack(provider) : undefined,
	name: String(itunes.trackName ?? 'Unknown Song'),
	artist: String(itunes.artistName ?? ''),
	album: String(itunes.collectionName ?? ''),
	artUrl: cleanArtwork(itunes.artworkUrl100),
	duration: Number(itunes.trackTimeMillis ?? 0) / 1000,
	genre: String(itunes.primaryGenreName ?? ''),
	bio: '',
})

const toAlbumResource = (itunes: ItunesResult, providers: SpicyTrack[]): DiscoveryResource => {
	const matchingProvider = providers.find((provider) => {
		const album = normalizeText(provider.albumName ?? provider.album)
		const artist = normalizeText(provider.artist ?? provider.artists?.[0])
		return album === normalizeText(itunes.collectionName) &&
			(!itunes.artistName || !artist || artist === normalizeText(itunes.artistName))
	})

	return {
		type: 'album',
		id: String(itunes.collectionId ?? ''),
		providerId: matchingProvider ? providerAlbumIdFromTrack(matchingProvider) : undefined,
		name: String(itunes.collectionName ?? 'Unknown Album'),
		artist: String(itunes.artistName ?? itunes.collectionArtistName ?? ''),
		album: String(itunes.collectionName ?? ''),
		artUrl: cleanArtwork(itunes.artworkUrl100, 600),
		genre: String(itunes.primaryGenreName ?? ''),
		bio: '',
	}
}

const toArtistResource = (itunes: ItunesResult): DiscoveryResource => ({
	type: 'artist',
	id: String(itunes.artistId ?? ''),
	name: String(itunes.artistName ?? 'Unknown Artist'),
	artist: String(itunes.artistName ?? ''),
	album: '',
	artUrl: cleanArtwork(itunes.artworkUrl100, 600),
	genre: String(itunes.primaryGenreName ?? ''),
	bio: '',
})

export const searchMusic = async (query: string, limit = 20): Promise<DiscoveryResource[]> => {
	const term = query.trim()
	if (!term) return []

	const [songs, albums, artists] = await Promise.all([
		searchItunesSongs(term, limit),
		searchItunesAlbums(term, Math.min(limit, 12)),
		searchItunesArtists(term, Math.min(limit, 12)),
	])

	let providerTracks: SpicyTrack[] = []
	try {
		providerTracks = await searchCatalog(term)
	} catch {
		providerTracks = []
	}

	const mappedSongs: DiscoveryResource[] = []
	for (const itunes of songs.slice(0, limit)) {
		let provider = findProviderTrack(itunes, providerTracks)
		if (!provider && mappedSongs.length < 6) provider = await fallbackProviderTrack(itunes)
		if (provider) mappedSongs.push(toSongResource(itunes, provider))
	}

	const albumResources = albums
		.filter((item) => item.collectionId != null && item.collectionName)
		.map((item) => toAlbumResource(item, providerTracks))
		.filter((item) => item.id)

	const artistResources = artists
		.filter((item) => item.artistId != null && item.artistName)
		.map(toArtistResource)

	const seen = new Set<string>()
	return [...mappedSongs, ...albumResources, ...artistResources].filter((item) => {
		const key = item.type + ':' + item.id
		if (!item.id || seen.has(key)) return false
		seen.add(key)
		return true
	})
}