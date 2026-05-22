/// <reference lib='WebWorker' />

import { workerAction } from './actions.js'
import type { TracksScanOptions } from './types.js'

declare const self: DedicatedWorkerGlobalScope

self.addEventListener('message', async (event: MessageEvent<TracksScanOptions>) => {
	const options = event.data

	try {
		await workerAction(options)
	} catch (err) {
		self.postMessage({ finished: true, count: { newlyImported: 0, current: 0, total: 0 } })
		console.error('[scanner worker]', err)
	}
})
