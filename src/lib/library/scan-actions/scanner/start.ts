import type { TracksScanMessage, TracksScanOptions, TracksScanResult } from './types.js'
import TracksWorker from './worker.ts?worker'

export type {
	/** @public */
	TracksScanOptions,
	/** @public */
	TracksScanResult,
} from './types.js'

/** @public */
export type TrackParsedFn = (totalParsedCount: number) => void

/** @public */
export const startTrackScannerWorker = (
	options: TracksScanOptions,
	progress: (data: TracksScanResult) => void,
): Promise<TracksScanResult> => {
	const { promise, reject, resolve } = Promise.withResolvers<TracksScanResult>()

	const worker = new TracksWorker()

	worker.addEventListener('error', reject)
	worker.addEventListener('message', ({ data }: MessageEvent<TracksScanMessage>) => {
		if (data.finished) {
			worker.terminate()
			resolve(data.count)
		} else {
			progress(data.count)
		}
	})

	worker.postMessage(options)

	return promise
}
