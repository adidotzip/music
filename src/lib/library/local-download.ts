import { getLibraryValue } from '$lib/library/get/value.ts'

const LOCAL_ALIAS_PREFIX = 'adi_music_local_track_alias:'

const getCachedLocalTrackId = (sourceId: number | string): number | undefined => {
    if (typeof window === 'undefined') return undefined

    try {
        const id = Number(localStorage.getItem(LOCAL_ALIAS_PREFIX + String(sourceId)) || '')
        return Number.isFinite(id) && id > 0 ? id : undefined
    } catch {
        return undefined
    }
}

const setCachedLocalTrackId = (sourceId: number | string, localTrackId: number) => {
    if (typeof window === 'undefined') return

    try {
        localStorage.setItem(LOCAL_ALIAS_PREFIX + String(sourceId), String(localTrackId))
    } catch {
        // Ignore storage failures.
    }
}

/**
 * Return a local IndexedDB track id when the requested id already exists locally.
 * This module intentionally performs no network requests and cannot download
 * remote audio.
 */
export const getStoredLocalTrackId = async (
    sourceId: number | string,
): Promise<number | undefined> => {
    const cachedId = getCachedLocalTrackId(sourceId)

    if (cachedId) {
        const cachedTrack = await getLibraryValue('tracks', cachedId, true)
        if (cachedTrack?.file) return cachedId
    }

    const numericId = Number(sourceId)
    if (!Number.isFinite(numericId) || numericId <= 0) return undefined

    const track = await getLibraryValue('tracks', numericId, true)
    if (!track?.file) return undefined

    setCachedLocalTrackId(sourceId, track.id)
    return track.id
}

export const isDownloadAbortError = (error: unknown): boolean =>
    error instanceof Error && error.name === 'AbortError'

/**
 * The old implementation downloaded remote audio into IndexedDB.
 * Adi Music is now local-only, so this only succeeds for tracks that are
 * already stored locally.
 */
export const ensureTrackIsStoredLocally = async (
    trackId: number,
    _onProgress?: (progress: number) => void,
): Promise<number> => {
    const track = await getLibraryValue('tracks', trackId, true)

    if (track?.file) return track.id

    throw new Error(`"${track?.name ?? 'This track'}" is not available locally.`)
}

export const cancelTrackDownload = (_trackId: number): boolean => false
