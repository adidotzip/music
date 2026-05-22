import type { TracksScanOptions } from './scanner/start.js'

export const scanTracks = async (options: TracksScanOptions): Promise<void> => {
	const snackbarId = 'scan-tracks'
	snackbar({
		id: snackbarId,
		message: m.settingsPreparingForScan(),
		controls: false,
		duration: false,
	})

	const { startTrackScannerWorker } = await import('./scanner/start.js')

	const result = await startTrackScannerWorker(options, (data) => {
		snackbar({
			id: snackbarId,
			message: m.settingsScanInProgress({
				current: data.current,
				total: data.total,
			}),
			controls: false,
			duration: false,
		})
	})

	if (result.newlyImported === 0) {
		snackbar({
			id: snackbarId,
			message: m.settingsScanNoNewTracks(),
			duration: 2000,
		})
	} else {
		snackbar({
			id: snackbarId,
			message: m.settingsScanNewOrUpdatedTracks({
				newTracks: result.newlyImported,
			}),
			duration: 8000,
		})
	}
}
