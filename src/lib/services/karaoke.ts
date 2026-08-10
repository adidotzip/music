import KaraokeWorker from './karaoke.worker.ts?worker'

export class KaraokeService {
	static #activeWorker: Worker | null = null
	static #activeReject: ((reason: any) => void) | null = null

	static cancel(): void {
		if (this.#activeWorker) {
			this.#activeWorker.terminate()
			this.#activeWorker = null
		}
		if (this.#activeReject) {
			this.#activeReject(new DOMException('Aborted', 'AbortError'))
			this.#activeReject = null
		}
	}

	static async process(
		originalFile: Blob,
	): Promise<{ instrumentalBlob: Blob; vocalBlob: Blob }> {
		this.cancel()

		const { promise, resolve, reject } = Promise.withResolvers<{
			instrumentalBlob: Blob
			vocalBlob: Blob
		}>()
		this.#activeReject = reject

		const worker = new KaraokeWorker()
		this.#activeWorker = worker

		worker.addEventListener('error', (err) => {
			reject(err)
			this.cancel()
		})

		worker.addEventListener('message', (event) => {
			const { status, left, right, leftVocal, rightVocal, sampleRate, error } = event.data
			if (status === 'success') {
				try {
					const instBlob = encodeWAV(left, right, sampleRate)
					const vocalBlob = encodeWAV(leftVocal, rightVocal, sampleRate)
					resolve({ instrumentalBlob: instBlob, vocalBlob: vocalBlob })
				} catch (e) {
					reject(e)
				} finally {
					this.cancel()
				}
			} else if (status === 'error') {
				reject(new Error(error))
				this.cancel()
			}
		})

		try {
			const arrayBuffer = await originalFile.arrayBuffer()
			const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
			if (!AudioCtxClass) {
				throw new Error('Web Audio API is not supported in this browser')
			}
			const audioCtx = new AudioCtxClass()
			let audioBuffer: AudioBuffer
			try {
				audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
			} finally {
				await audioCtx.close()
			}

			const sampleRate = audioBuffer.sampleRate
			const leftChannel = audioBuffer.getChannelData(0)
			const rightChannel =
				audioBuffer.numberOfChannels > 1
					? audioBuffer.getChannelData(1)
					: new Float32Array(leftChannel.length).set(leftChannel)

			// Create transferable float arrays
			const leftCopy = new Float32Array(leftChannel)
			const rightCopy = rightChannel instanceof Float32Array ? new Float32Array(rightChannel) : leftCopy

			worker.postMessage(
				{
					left: leftCopy,
					right: rightCopy,
					sampleRate,
				},
				[leftCopy.buffer, rightCopy.buffer],
			)
		} catch (e) {
			reject(e)
			this.cancel()
		}

		return promise
	}
}

export async function blendStems(instBlob: Blob, vocalBlob: Blob): Promise<Blob> {
	const arrayBufferInst = await instBlob.arrayBuffer()
	const arrayBufferVoc = await vocalBlob.arrayBuffer()
	const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
	if (!AudioCtxClass) {
		throw new Error('Web Audio API is not supported in this browser')
	}
	const audioCtx = new AudioCtxClass()
	try {
		const instBuffer = await audioCtx.decodeAudioData(arrayBufferInst)
		const vocBuffer = await audioCtx.decodeAudioData(arrayBufferVoc)
		const len = instBuffer.length
		const bL = new Float32Array(len)
		const bR = new Float32Array(len)
		const instL = instBuffer.getChannelData(0)
		const instR = instBuffer.numberOfChannels > 1 ? instBuffer.getChannelData(1) : instL
		const vocL = vocBuffer.getChannelData(0)
		const vocR = vocBuffer.numberOfChannels > 1 ? vocBuffer.getChannelData(1) : vocL

		// Mix Instrumental with 15% vocals
		for (let i = 0; i < len; i++) {
			bL[i] = (instL[i] ?? 0) + (vocL[i] ?? 0) * 0.15
			bR[i] = (instR[i] ?? 0) + (vocR[i] ?? 0) * 0.15
		}

		return encodeWAV(bL, bR, instBuffer.sampleRate)
	} finally {
		await audioCtx.close()
	}
}

function writeString(view: DataView, offset: number, str: string) {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i))
	}
}

function encodeWAV(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
	const buffer = new ArrayBuffer(44 + left.length * 8)
	const view = new DataView(buffer)

	/* RIFF identifier */
	writeString(view, 0, 'RIFF')
	/* file length */
	view.setUint32(4, 36 + left.length * 8, true)
	/* RIFF type */
	writeString(view, 8, 'WAVE')
	/* format chunk identifier */
	writeString(view, 12, 'fmt ')
	/* format chunk length */
	view.setUint32(16, 16, true)
	/* sample format (raw: 3 = IEEE float) */
	view.setUint16(20, 3, true)
	/* channel count */
	view.setUint16(22, 2, true)
	/* sample rate */
	view.setUint32(24, sampleRate, true)
	/* byte rate (sample rate * block align) */
	view.setUint32(28, sampleRate * 8, true)
	/* block align (channel count * bytes per sample) */
	view.setUint16(32, 8, true)
	/* bits per sample */
	view.setUint16(34, 32, true)
	/* data chunk identifier */
	writeString(view, 36, 'data')
	/* data chunk length */
	view.setUint32(40, left.length * 8, true)

	let offset = 44
	for (let i = 0; i < left.length; i++) {
		view.setFloat32(offset, left[i] ?? 0, true)
		view.setFloat32(offset + 4, right[i] ?? 0, true)
		offset += 8
	}

	return new Blob([view], { type: 'audio/wav' })
}
