import { WeakLRUCache } from 'weak-lru-cache'
import { type DbKey, getDatabase } from '$lib/db/database.ts'
import { type DatabaseChangeDetails, onDatabaseChange } from '$lib/db/events.ts'
import type { Album, Artist, Playlist, Track } from '$lib/library/types.ts'
import { FAVORITE_PLAYLIST_ID, FAVORITE_PLAYLIST_UUID, type LibraryStoreName } from '../types.ts'

const idToUuidMap = new Map<number, string>()
const remoteTrackMap = new Map<number, TrackData>()
const REMOTE_TRACK_STORAGE_PREFIX = 'adi_music_remote_track:'

const LOCAL_TRACK_ALIAS_PREFIX = 'adi_music_local_track_alias:'

const getPersistedLocalTrackAlias = (sourceId: number): number | undefined => {
    if (typeof window === 'undefined' || sourceId >= 0) return undefined

    try {
        const id = Number(localStorage.getItem(LOCAL_TRACK_ALIAS_PREFIX + sourceId) || '')
        return Number.isFinite(id) && id > 0 ? id : undefined
    } catch {
        return undefined
    }
}

const isLocalAliasValid = async (sourceId: number, localId: number) => {
    try {
        const db = await getDatabase()
        const localTrack = await db.get('tracks', localId)
        return Boolean(localTrack?.file)
    } catch {
        return false
    }
}

type CacheKey<Store extends LibraryStoreName> = `${Store}:${string}`

const getCacheKey = <Store extends LibraryStoreName>(
    storeName: Store,
    key: DbKey<Store>,
): CacheKey<Store> => `${storeName}:${key}`

interface QueryConfig<Result> {
    fetch: (id: number) => Promise<Result | undefined>
    shouldRefetch: (
        itemId: number | undefined,
        changes: readonly DatabaseChangeDetails[],
    ) => boolean
}

const defaultRefreshOnDatabaseChanges = (
    storeName: LibraryStoreName,
    itemId: number | undefined,
    changes: readonly DatabaseChangeDetails[],
) => {
    for (const change of changes) {
        if (change.storeName === storeName) {
            if (itemId === undefined) {
                return true
            }

            if (change.key === itemId) {
                return true
            }
        }
    }

    return false
}

export interface TrackData extends Track {
    type: 'track'
    favorite: boolean
}

const trackConfig: QueryConfig<TrackData> = {
    fetch: async (id) => {
        if (id < 0) {
            const localAlias = getPersistedLocalTrackAlias(id)
            if (localAlias && await isLocalAliasValid(id, localAlias)) {
                return trackConfig.fetch(localAlias)
            }
            return undefined
        }

        const db = await getDatabase()
        const tx = db.transaction(['tracks', 'playlistEntries'], 'readonly')

        const [item, favorite] = await Promise.all([
            tx.objectStore('tracks').get(id),
            tx
                .objectStore('playlistEntries')
                .index('playlistTrack')
                .get([FAVORITE_PLAYLIST_ID, id]),
        ])

        if (!item) {
            return undefined
        }

        return {
            ...item,
            type: 'track',
            favorite: !!favorite,
        } as TrackData
    },
    shouldRefetch: (itemId, changes) => {
        for (const change of changes) {
            if (change.storeName === 'playlistEntries') {
                const playlistEntry = change.value

                if (
                    playlistEntry.playlistId === FAVORITE_PLAYLIST_ID &&
                    itemId === playlistEntry.trackId
                ) {
                    return true
                }
            }

            if (change.storeName === 'tracks' && change.key === itemId) {
                return true
            }
        }

        return false
    },
}

const dbGetValue = async <Store extends LibraryStoreName, const T extends string>(
    storeName: Store,
    type: T,
    id: number,
) => {
    const db = await getDatabase()
    const value = await db.get(storeName, id)
    if (!value) {
        return undefined
    }

    return {
        ...value,
        type,
    }
}

export interface AlbumData extends Album {
    type: 'album'
}

const albumConfig: QueryConfig<AlbumData> = {
    fetch: (id) => dbGetValue('albums', 'album', id),
    shouldRefetch: defaultRefreshOnDatabaseChanges.bind(null, 'albums'),
}
export interface ArtistData extends Artist {
    type: 'artist'
}

const artistConfig: QueryConfig<ArtistData> = {
    fetch: (id) => dbGetValue('artists', 'artist', id),
    shouldRefetch: defaultRefreshOnDatabaseChanges.bind(null, 'artists'),
}

export interface PlaylistData extends Playlist {
    type: 'playlist'
}

const playlistsConfig: QueryConfig<PlaylistData> = {
    fetch: (id) => {
        if (id === FAVORITE_PLAYLIST_ID) {
            const favoritePlaylist: PlaylistData = {
                type: 'playlist',
                id: FAVORITE_PLAYLIST_ID,
                uuid: FAVORITE_PLAYLIST_UUID,
                name: m.favorites(),
                description: '',
                createdAt: 0,
            }

            return Promise.resolve(favoritePlaylist)
        }

        return dbGetValue('playlists', 'playlist', id)
    },
    shouldRefetch: defaultRefreshOnDatabaseChanges.bind(null, 'playlists'),
}

interface LibraryValueMap {
    tracks: TrackData
    albums: AlbumData
    artists: ArtistData
    playlists: PlaylistData
}

type LibraryValue<Store extends LibraryStoreName = LibraryStoreName> = LibraryValueMap[Store]

type LibraryConfigMap = {
    [Store in LibraryStoreName]: QueryConfig<LibraryValue<Store>>
}

const libraryConfigMap = {
    tracks: trackConfig,
    albums: albumConfig,
    artists: artistConfig,
    playlists: playlistsConfig,
} satisfies LibraryConfigMap

type LibraryCachedValue<Store extends LibraryStoreName = LibraryStoreName> =
    | LibraryValue<Store>
    | Promise<LibraryValue<Store> | undefined>

type CacheKeyObject = { key: string }

class LibraryValueCache {
    #keyMap = new Map<string, CacheKeyObject>()

    #cache = new WeakLRUCache<CacheKeyObject, LibraryCachedValue<LibraryStoreName>>({
        cacheSize: 10_000,
    })

    #getKeyObject(keyString: string): CacheKeyObject {
        let keyObj = this.#keyMap.get(keyString)
        if (!keyObj) {
            keyObj = { key: keyString }
            this.#keyMap.set(keyString, keyObj)
        }
        return keyObj
    }

    get<Store extends LibraryStoreName>(key: CacheKey<Store>) {
        const keyObj = this.#getKeyObject(key)
        return this.#cache.getValue(keyObj) as LibraryCachedValue<Store> | undefined
    }

    set<Store extends LibraryStoreName>(
        key: CacheKey<Store>,
        value: LibraryCachedValue<Store> | undefined,
    ) {
        const keyObj = this.#getKeyObject(key)
        if (value) {
            this.#cache.setValue(keyObj, value)
        } else {
            this.delete(key)
        }
    }

    delete<Store extends LibraryStoreName>(key: CacheKey<Store>) {
        const keyObj = this.#keyMap.get(key)
        if (keyObj) {
            this.#cache.delete(keyObj)
            this.#keyMap.delete(key)
        }
    }

    clear() {
        this.#cache.clear()
        this.#keyMap.clear()
    }
}

// Fast in memory cache for `items`, so we do not need to
// call indexed db for every access.
// IMPORTANT. Only store whole library items in here.
const valueCache = new LibraryValueCache()

if (import.meta.env.DEV) {
    // @ts-expect-error used for debugging
    globalThis.libraryValueCache = valueCache
}

if (!import.meta.env.SSR) {
    onDatabaseChange((changes) => {
        for (const change of changes) {
            const { storeName } = change

            if (
                storeName === 'tracks' ||
                storeName === 'albums' ||
                storeName === 'artists' ||
                storeName === 'playlists'
            ) {
                if (change.operation === 'delete' || change.operation === 'update') {
                    const cacheKey = getCacheKey(storeName, change.key)
                    valueCache.delete(cacheKey)
                }
            } else if (storeName === 'playlistEntries') {
                const playlistEntry = change.value

                if (playlistEntry.playlistId === FAVORITE_PLAYLIST_ID) {
                    const cacheKey = getCacheKey('tracks', playlistEntry.trackId)
                    valueCache.delete(cacheKey)
                }
            }
        }
    })
}

export class LibraryValueNotFoundError extends Error {
    constructor(cacheKey: CacheKey<LibraryStoreName>) {
        super(`Value not found. Cache key: ${cacheKey}`)
        this.name = 'LibraryValueNotFoundError'
    }
}

const assertsValue = <T, AllowEmpty extends boolean = false>(
    value: T,
    allowEmpty: AllowEmpty | undefined,
    cacheKey: CacheKey<LibraryStoreName>,
) => {
    if (!(value || allowEmpty)) {
        throw new LibraryValueNotFoundError(cacheKey)
    }

    return value
}

const getCachedOrFetchValue = <Store extends LibraryStoreName>(
    key: CacheKey<Store>,
    fetchValue: () => Promise<GetLibraryValueResult<Store> | undefined>,
): LibraryValue<Store> | Promise<LibraryValue<Store> | undefined> => {
    const cachedValue = valueCache.get(key)
    if (cachedValue) {
        return cachedValue
    }

    const promise = fetchValue()
        .then((value) => {
            valueCache.set(key, value)

            return value
        })
        .catch((error) => {
            valueCache.delete(key)
            throw error
        })

    valueCache.set(key, promise)

    return promise
}

export type GetLibraryValueResult<
    Store extends LibraryStoreName,
    AllowEmpty extends boolean = false,
> = AllowEmpty extends true ? LibraryValue<Store> | undefined : LibraryValue<Store>

/** @public */
export const getLibraryValue = <Store extends LibraryStoreName, AllowEmpty extends boolean = false>(
    storeName: Store,
    id: number,
    allowEmpty?: AllowEmpty,
): Promise<GetLibraryValueResult<Store, AllowEmpty>> | GetLibraryValueResult<Store, AllowEmpty> => {
    const key = getCacheKey(storeName, id)
    const result = getCachedOrFetchValue(key, () => {
        const config: LibraryConfigMap[Store] = libraryConfigMap[storeName]

        return config.fetch(id)
    })

    if (result instanceof Promise) {
        const promiseResult = result.then((value) =>
            assertsValue(value, allowEmpty, key),
        ) as Promise<GetLibraryValueResult<Store, AllowEmpty>>

        return promiseResult
    }

    return assertsValue(result, allowEmpty, key)
}

/** @public */
export const preloadLibraryValue = async (
    storeName: LibraryStoreName,
    id: number,
): Promise<void> => {
    try {
        // this will fetch data and store it inside cache
        await getLibraryValue(storeName, id)
    } catch {
        // Ignore
    }
}

/** @public */
export const setLibraryValueInCache = <Store extends LibraryStoreName>(
    storeName: Store,
    id: number,
    value: LibraryValue<Store>,
) => {
    const key = getCacheKey(storeName, id)
    valueCache.set(key, value)
}

export const shouldRefetchLibraryValue = (
    storeName: LibraryStoreName,
    id: number | undefined,
    changes: readonly DatabaseChangeDetails[],
): boolean => {
    const config = libraryConfigMap[storeName]

    return config.shouldRefetch(id, changes)
}

/** @private - Used for testing only */
export const clearLibraryValueCache = () => {
    valueCache.clear()
}
