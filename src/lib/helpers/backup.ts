import { getDatabase } from '$lib/db/database.ts'

export interface BackupData {
	version: number
	timestamp: number
	localStorage: Record<string, string>
	db: {
		tracks: unknown[]
		albums: unknown[]
		artists: unknown[]
		playlists: unknown[]
		playlistEntries: unknown[]
		playHistory: unknown[]
		lyrics: unknown[]
	}
}

export const exportBackupData = async (): Promise<BackupData> => {
	// Gather localStorage items
	const lsData: Record<string, string> = {}
	for (let i = 0; i < localStorage.length; i += 1) {
		const key = localStorage.key(i)
		if (key && (key.startsWith('snaeplayer-') || key === 'snae-locale')) {
			// Skip artwork caches to keep backup small and text-only
			if (key.includes('artwork')) {
				continue
			}
			const val = localStorage.getItem(key)
			if (val !== null) {
				lsData[key] = val
			}
		}
	}

	const db = await getDatabase()
	const stores = [
		'tracks',
		'albums',
		'artists',
		'playlists',
		'playlistEntries',
		'playHistory',
		'lyrics',
	] as const

	const dbData: Record<string, unknown[]> = {}

	for (const storeName of stores) {
		const items = await db.getAll(storeName)
		dbData[storeName] = items.map((item) => {
			if (!item) {
				return item
			}
			const cloned = { ...(item as Record<string, unknown>) }
			if (storeName === 'tracks' || storeName === 'albums') {
				delete cloned.image
			}
			return cloned
		})
	}

	return {
		version: 1,
		timestamp: Date.now(),
		localStorage: lsData,
		db: dbData as unknown as BackupData['db'],
	}
}

export const validateBackupData = (data: unknown): data is BackupData => {
	if (!data || typeof data !== 'object') {
		return false
	}
	const obj = data as Record<string, unknown>
	if (obj.version !== 1) {
		return false
	}
	if (!obj.localStorage || typeof obj.localStorage !== 'object') {
		return false
	}
	if (!obj.db || typeof obj.db !== 'object') {
		return false
	}

	const dbObj = obj.db as Record<string, unknown>
	const requiredStores = [
		'tracks',
		'albums',
		'artists',
		'playlists',
		'playlistEntries',
		'playHistory',
		'lyrics',
	]
	for (const store of requiredStores) {
		if (!Array.isArray(dbObj[store])) {
			return false
		}
	}

	return true
}

export const importBackupData = async (backup: BackupData): Promise<void> => {
	const db = await getDatabase()
	// Clear all stores and write backup data
	const stores = [
		'tracks',
		'albums',
		'artists',
		'playlists',
		'playlistEntries',
		'playHistory',
		'lyrics',
		'directories',
	] as const

	const tx = db.transaction(stores, 'readwrite')

	for (const storeName of stores) {
		const store = tx.objectStore(storeName)
		await store.clear()
		// directories is cleared, but not populated from backup
		if (storeName !== 'directories') {
			const items = backup.db[storeName] || []
			for (const item of items) {
				await store.add(item)
			}
		}
	}

	await tx.done

	// Clear current localStorage keys (snaeplayer- and snae-locale)
	for (let i = localStorage.length - 1; i >= 0; i -= 1) {
		const key = localStorage.key(i)
		if (key && (key.startsWith('snaeplayer-') || key === 'snae-locale')) {
			localStorage.removeItem(key)
		}
	}

	// Restore new localStorage keys
	for (const [key, value] of Object.entries(backup.localStorage)) {
		localStorage.setItem(key, value)
	}
}
