import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase } from '$lib/db/database.ts'
import { clearDatabaseStores } from '$lib/helpers/test-helpers.ts'
import { exportBackupData, importBackupData, validateBackupData } from '../backup.ts'
import JSZip from 'jszip'

describe('backup and restore', () => {
	beforeEach(async () => {
		await clearDatabaseStores()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it('exports and imports backup data correctly', async () => {
		const db = await getDatabase()
		// Let's seed some data in the database
		await db.add('artists', {
			id: 1,
			uuid: 'artist-1',
			name: 'Test Artist',
		})

		await db.add('albums', {
			id: 1,
			uuid: 'album-1',
			name: 'Test Album',
			artists: ['Test Artist'],
			year: '2023',
		})

		await db.add('tracks', {
			id: 1,
			uuid: 'track-1',
			name: 'Test Track',
			artists: ['Test Artist'],
			album: 'Test Album',
			year: '2023',
			duration: 120,
			genre: ['Pop'],
			trackNo: 1,
			trackOf: 10,
			discNo: 1,
			discOf: 1,
			fileName: 'test.mp3',
			directory: -1,
			scannedAt: Date.now(),
			file: new File(['audio'], 'test.mp3', { type: 'audio/mpeg' }),
		})

		// Export
		const backupBlob = await exportBackupData()
		expect(backupBlob).toBeInstanceOf(Blob)

		// Parse the ZIP file to validate its content
		const zip = await JSZip.loadAsync(backupBlob)
		const backupJsonFile = zip.file('backup.json')
		expect(backupJsonFile).not.toBeNull()

		const text = await backupJsonFile!.async('string')
		const backupData = JSON.parse(text)

		expect(validateBackupData(backupData)).toBe(true)
		expect(backupData.db.tracks).toHaveLength(1)
		expect(backupData.db.artists).toHaveLength(1)

		// Now clear database
		await clearDatabaseStores()

		// Import
		await importBackupData(zip, backupData)

		// Verify database after import
		const restoredArtists = await db.getAll('artists')
		expect(restoredArtists).toHaveLength(1)
		expect(restoredArtists[0]?.name).toBe('Test Artist')

		const restoredTracks = await db.getAll('tracks')
		expect(restoredTracks).toHaveLength(1)
		expect(restoredTracks[0]?.name).toBe('Test Track')
	})

	it('handles validation and loading of older/incomplete backups gracefully', async () => {
		// Mock an older backup missing 'lyrics' and 'playHistory' fields under 'db'
		const oldBackupData = {
			version: 1,
			timestamp: Date.now(),
			localStorage: {
				'snaeplayer-test': 'some-value',
			},
			db: {
				tracks: [],
				albums: [],
				artists: [],
				playlists: [],
				playlistEntries: [],
				// missing playHistory and lyrics
			},
		}

		// Validation should pass
		expect(validateBackupData(oldBackupData)).toBe(true)

		const db = await getDatabase()
		// Seed some initial data that should be cleared
		await db.add('artists', {
			id: 1,
			uuid: 'old-artist',
			name: 'Old Artist',
		})

		const zip = new JSZip()
		// Import older backup
		await importBackupData(zip, oldBackupData as any)

		// Database should be cleared, and stores should be successfully updated (empty but valid)
		const restoredArtists = await db.getAll('artists')
		expect(restoredArtists).toHaveLength(0)

		const restoredTracks = await db.getAll('tracks')
		expect(restoredTracks).toHaveLength(0)
	})
})
