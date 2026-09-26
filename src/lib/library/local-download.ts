import { getLibraryValue } from '$lib/library/get/value.ts'
import { dbImportTrack } from '$lib/library/scan-actions/scanner/import-track.ts'
import { LEGACY_NO_NATIVE_DIRECTORY, UNKNOWN_ITEM, type UnknownTrack } from '$lib/library/types.ts'
import { spicyamll } from '$lib/services/spicyamll.ts'
import { getDatabase } from '$lib/db/database.ts'

const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024
const pendingDownloads = new Map<string, Promise<number>>()
const LOCAL_ALIAS_PREFIX = 'adi_music_local_track_alias:'

const getCachedLocalTrackId = (sourceId: number | string): number | undefined => {
	if (typeof window === 'undefined') return undefined
	const key = String(sourceId)
	try {
		const id = Number(localStorage.getItem(LOCAL_ALIAS_PREFIX + key) || '')
		return Number.isFinite(id) && id > 0 ? id : undefined
	} catch {
		return undefined
	}
}

const sanitizeFilename = (value: string) =>
	value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown'

const getAudioExtension = (blob: Blob): string => {
	const type = blob.type.toLowerCase()

	if (type.includes('mpeg')) return 'mp3'
	if (type.includes('ogg')) return 'ogg'
	if (type.includes('flac')) return 'flac'
	if (type.includes('wav')) return 'wav'
	if (type.includes('aac')) return 'aac'

	return 'm4a'
}

type LibraryTrack = Awaited<ReturnType<typeof getLibraryValue<'tracks', true>>>

const getDownloadUrls = (track: LibraryTrack): string[] => {
	if (!track) return []

	const urls: string[] = []

	// Always prefer the dedicated download endpoint for remote songs. The
	// playback URL is a streaming source and should never be the primary
	// source for an offline-library import.
	if (track.remoteId !== undefined && track.remoteId !== null && String(track.remoteId).trim() !== '' && String(track.remoteId) !== '0') {
		urls.push(
			spicyamll.downloadUrl(track.remoteId, {
				codec: 'aac',
				language: 'en-US',
			}),
		)
		// Keep the official SpicyAMLL stream URL as a fallback source for
		// offline import. Downloading the response into IndexedDB is still
		// what makes the track offline; this does not start the player.
		urls.push(
			spicyamll.streamUrl(track.remoteId, {
				codec: 'aac',
				fallback: true,
				language: 'en-US',
			}),
		)
	}

	if (track.url?.startsWith('http') && !track.url.includes('/stream?')) {
		urls.push(track.url)
	}

	return [...new Set(urls)]
}

const downloadAndImport = async (trackId: number): Promise<number> => {
	let resolvedTrackId = trackId
	let track = await getLibraryValue('tracks', resolvedTrackId, true)
	if (!track) {
		// Discovery/search tracks can expose a catalog ID without first being
		// materialized in the local IndexedDB library. Create the same remote
		// track record the player uses, but do not touch the player itself.
		const remoteId = String(trackId)
		const { parseDiscoveryResults, spicyamll } = await import('$lib/services/spicyamll.ts')
		const response = await spicyamll.search({ term: remoteId, types: 'songs', limit: 10 })
		const songs = parseDiscoveryResults(response).filter((item) => item.type === 'song')
		const match = songs.find((song) => String(song.id) === remoteId)
		if (!match) throw new Error('Track is no longer available.')

		resolvedTrackId = -Math.max(1, Math.abs(hashRemoteTrackId(remoteId)))
		track = {
			id: resolvedTrackId,
			remoteId: remoteId,
			streaming: true,
			uuid: 'spicyamll:' + remoteId,
			name: match.name,
			album: match.album || UNKNOWN_ITEM,
			artists: match.artist ? [match.artist] : ['Unknown Artist'],
			year: UNKNOWN_ITEM,
			duration: match.duration ?? 0,
			genre: match.genre ? [match.genre] : [],
			trackNo: 0,
			trackOf: 0,
			discNo: 0,
			discOf: 0,
			language: undefined,
			image: match.artUrl ? { optimized: false, small: match.artUrl, full: match.artUrl } : undefined,
			file: undefined,
			directory: undefined,
			fileName: undefined,
			scannedAt: Date.now(),
			url: spicyamll.streamUrl(remoteId, { codec: 'aac', fallback: true, language: 'en-US' }),
			favorite: false,
			type: 'track',
		} as LibraryTrack
			}

	if (track.file instanceof File) return track.id
	if (resolvedTrackId >= 0 && track.file) return track.id

	const database = await getDatabase()
	const existing = await database.getFromIndex('tracks', 'uuid', track.uuid)
	if (existing?.file) {
		if (trackId < 0) {
			try {
				localStorage.setItem(LOCAL_ALIAS_PREFIX + trackId, String(existing.id))
			} catch {}
		}
		return existing.id
	}

	const urls = getDownloadUrls(track)
	if (!urls.length) {
		throw new Error(`No downloadable source is available for "${track.name}".`)
	}

	let response: Response | undefined
	let lastError: unknown

	for (const url of urls) {
		try {
			const candidate = await fetch(url, {
				method: 'GET',
				mode: 'cors',
				credentials: 'omit',
				cache: 'no-store',
				headers: { Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5' },
			})

			const contentType = candidate.headers.get('content-type')?.toLowerCase() ?? ''
			if (
				candidate.ok &&
				!contentType.includes('application/json') &&
				!contentType.includes('text/html')
			) {
				response = candidate
				break
			}

			let detail = ''
			try {
				detail = (await candidate.text()).slice(0, 160)
			} catch {}
			lastError = new Error(
				`Download failed (${candidate.status})${detail ? `: ${detail}` : '.'}`,
			)
		} catch (error) {
			lastError = error
		}
	}

	if (!response) {
		throw new Error(
			`Unable to fetch the audio for "${track.name}". Check your connection or whether this song is available offline.`,
			{ cause: lastError },
		)
	}

	const contentLength = Number(response.headers.get('content-length') || 0)
	if (contentLength > MAX_DOWNLOAD_BYTES) {
		throw new Error('The track is too large to store locally.')
	}

	const blob = await response.blob()
	if (blob.size === 0) {
		throw new Error('The downloaded track was empty.')
	}
	if (blob.size > MAX_DOWNLOAD_BYTES) {
		throw new Error('The track is too large to store locally.')
	}

	const extension = getAudioExtension(blob)
	const filename = `${sanitizeFilename(track.artists?.join(', ') || 'Unknown Artist')} - ${sanitizeFilename(track.name)}.${extension}`
	const file = new File([blob], filename, {
		type: blob.type || 'audio/mp4',
		lastModified: Date.now(),
	})

	let parsedData: UnknownTrack

	try {
		const { parseTrackMetadata } = await import('$lib/library/scan-actions/scanner/parse/parse-track.ts')
		const parsed = await parseTrackMetadata(file)

		if (!parsed) throw new Error('Metadata parser returned no track.')

		parsedData = {
			...parsed.data,
			name: parsed.data.name || track.name,
			album: parsed.data.album || track.album || UNKNOWN_ITEM,
			artists: parsed.data.artists?.length ? parsed.data.artists : track.artists?.length ? track.artists : ['Unknown Artist'],
			year: parsed.data.year || track.year || UNKNOWN_ITEM,
			duration: parsed.data.duration || track.duration || 0,
			genre: parsed.data.genre?.length ? parsed.data.genre : track.genre || [],
			trackNo: parsed.data.trackNo || track.trackNo || 0,
			trackOf: parsed.data.trackOf || track.trackOf || 0,
			discNo: parsed.data.discNo || track.discNo || 0,
			discOf: parsed.data.discOf || track.discOf || 0,
			language: parsed.data.language || track.language,
			image: parsed.data.image ?? track.image,
			primaryColor: parsed.data.primaryColor ?? track.primaryColor,
			file,
			directory: LEGACY_NO_NATIVE_DIRECTORY,
			fileName: file.name,
			scannedAt: Date.now(),
			uuid: track.uuid,
			remoteId: track.remoteId,
			streaming: false,
			url: undefined,
		}
	} catch {
		parsedData = {
			name: track.name,
			album: track.album || UNKNOWN_ITEM,
			artists: track.artists?.length ? track.artists : ['Unknown Artist'],
			year: track.year || UNKNOWN_ITEM,
			duration: track.duration || 0,
			genre: track.genre || [],
			trackNo: track.trackNo || 0,
			trackOf: track.trackOf || 0,
			discNo: track.discNo || 0,
			discOf: track.discOf || 0,
			language: track.language,
			image: track.image,
			primaryColor: track.primaryColor,
			file,
			directory: LEGACY_NO_NATIVE_DIRECTORY,
			fileName: file.name,
			scannedAt: Date.now(),
			uuid: track.uuid,
			remoteId: track.remoteId,
			streaming: false,
			url: undefined,
		}
	}

	const localTrackId = await dbImportTrack(parsedData, resolvedTrackId >= 0 ? resolvedTrackId : undefined)

	if (resolvedTrackId < 0 || resolvedTrackId !== trackId) {
		try {
			localStorage.setItem(LOCAL_ALIAS_PREFIX + trackId, String(localTrackId))
		} catch {}
	}
	return localTrackId
}

const hashRemoteTrackId = (value: string): number => {
	let hash = 0
	for (let i = 0; i < value.length; i++) hash = (hash << 5) - hash + value.charCodeAt(i) | 0
	return hash
}

export const ensureTrackIsStoredLocally = async (trackId: number | string): Promise<number> => {
	const cachedLocalTrackId = getCachedLocalTrackId(trackId)
	if (cachedLocalTrackId) {
		const cachedTrack = await getLibraryValue('tracks', cachedLocalTrackId, true)
		if (cachedTrack?.file) return cachedLocalTrackId
	}

	const existingRequest = pendingDownloads.get(String(trackId))
	if (existingRequest) return existingRequest

	const numericTrackId = typeof trackId === 'number' ? trackId : Number(trackId)
	const request = downloadAndImport(
		Number.isFinite(numericTrackId)
			? numericTrackId
			: -Math.max(1, Math.abs(hashRemoteTrackId(String(trackId)))),
	).finally(() => {
		pendingDownloads.delete(String(trackId))
	})

	pendingDownloads.set(String(trackId), request)
	return request
}
