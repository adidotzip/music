import { describe, expect, it, vi } from 'vitest'
import { KaraokeService, blendStems } from '../karaoke'

// Mock the Web Worker
vi.mock('../karaoke.worker.ts?worker', () => {
	return {
		default: class MockWorker {
			onmessage: any
			postMessage = vi.fn((data) => {
				// Simulate successful separation message
				setTimeout(() => {
					if (this.onmessage) {
						this.onmessage({
							data: {
								status: 'success',
								left: new Float32Array([0.1, 0.2]),
								right: new Float32Array([0.3, 0.4]),
								leftVocal: new Float32Array([0.01, 0.02]),
								rightVocal: new Float32Array([0.03, 0.04]),
								sampleRate: 44100
							}
						})
					}
				}, 10)
			})
			terminate = vi.fn()
			addEventListener = vi.fn((event, handler) => {
				if (event === 'message') {
					this.onmessage = handler
				}
			})
		}
	}
})

// Stub window.AudioContext and decodeAudioData
const mockAudioBuffer = {
	sampleRate: 44100,
	length: 100,
	numberOfChannels: 2,
	getChannelData: vi.fn(() => new Float32Array(100))
}

class MockAudioContext {
	decodeAudioData = vi.fn().mockResolvedValue(mockAudioBuffer)
	close = vi.fn().mockResolvedValue(undefined)
}

vi.stubGlobal('AudioContext', MockAudioContext)

describe('KaraokeService & blendStems', () => {
	it('processes a Blob file through the worker and returns instrumental/vocal WAV blobs', async () => {
		const dummyFile = new Blob([new Uint8Array(100)], { type: 'audio/mp3' })
		const result = await KaraokeService.process(dummyFile)

		expect(result).toBeDefined()
		expect(result.instrumentalBlob).toBeInstanceOf(Blob)
		expect(result.vocalBlob).toBeInstanceOf(Blob)
		expect(result.instrumentalBlob.type).toBe('audio/wav')
		expect(result.vocalBlob.type).toBe('audio/wav')
	})

	it('blends instrumental and vocal stems on the fly', async () => {
		const dummyInst = new Blob([new Uint8Array(100)], { type: 'audio/wav' })
		const dummyVocal = new Blob([new Uint8Array(100)], { type: 'audio/wav' })

		const blended = await blendStems(dummyInst, dummyVocal)
		expect(blended).toBeInstanceOf(Blob)
		expect(blended.type).toBe('audio/wav')
	})

	it('supports cancellation of active worker execution', async () => {
		const dummyFile = new Blob([new Uint8Array(100)], { type: 'audio/mp3' })
		const promise = KaraokeService.process(dummyFile)
		KaraokeService.cancel()

		await expect(promise).rejects.toThrow('Aborted')
	})
})
