<script lang="ts">
	import { Kawarp } from '@kawarp/core'
	import { onMount } from 'svelte'

	interface Props {
		imageUrl: string | null
		enabled?: boolean
		warpIntensity?: number
		blurPasses?: number
		animationSpeed?: number
		transitionDuration?: number
		saturation?: number
		tintColor?: [number, number, number]
		tintIntensity?: number
		dithering?: number
		scale?: number
	}

	const {
		imageUrl,
		enabled = true,
		warpIntensity = 0.8,
		blurPasses = 8,
		animationSpeed = 1,
		transitionDuration = 1000,
		saturation = 1.4,
		tintColor,
		tintIntensity = 0.18,
		dithering = 0.012,
		scale = 1,
	}: Props = $props()

	const mainStore = useMainStore()
	const player = usePlayer()

	let canvasElement = $state<HTMLCanvasElement>()
	let kawarpInstance: Kawarp | null = null

	let isDesktop = $state(true)
	let isLoaded = $state(false)

	let currentLoadedUrl: string | null = null
	let animationFrameId: number | null = null
	let imageLoadId = 0

	/**
	 * Audio analysis
	 *
	 * Keep these values outside the RAF callback so we don't
	 * allocate objects/arrays every frame.
	 */
	let analyserData: Uint8Array | null = null
	let smoothedBass = 0
	let bassEnergy = 0
	let beatEnergy = 0
	let beatThreshold = 0

	let lastFrameTime = 0

	const activeTintColor = $derived<[number, number, number]>(
		tintColor ??
			(mainStore.isThemeDark
				? [0.12, 0.12, 0.18]
				: [0.96, 0.96, 0.98]),
	)

	const isReducedMotion = $derived(mainStore.isReducedMotion)

	const activeAnimationSpeed = $derived(
		isReducedMotion ? 0 : animationSpeed,
	)

	/**
	 * Frame-rate independent smoothing.
	 */
	const smooth = (
		current: number,
		target: number,
		speed: number,
		dt: number,
	) => {
		const amount = 1 - Math.exp(-speed * dt)
		return current + (target - current) * amount
	}

	/**
	 * Load an image into Kawarp.
	 */
	const loadKawarpImage = async (
		instance: Kawarp,
		url: string,
	) => {
		if (url.startsWith('blob:')) {
			const response = await fetch(url)

			if (!response.ok) {
				throw new Error(
					`Failed to fetch artwork: ${response.status}`,
				)
			}

			const blob = await response.blob()
			await instance.loadBlob(blob)
		} else {
			await instance.loadImage(url)
		}
	}

	/**
	 * Reset audio-reactive state.
	 */
	const resetAudioState = () => {
		smoothedBass = 0
		bassEnergy = 0
		beatEnergy = 0
		beatThreshold = 0
	}

	/**
	 * Audio-reactive animation.
	 *
	 * This intentionally uses a soft response instead of directly
	 * mapping raw frequency data to the artwork.
	 */
	const updateAudioReaction = (
		currentTime: number,
	) => {
		if (
			!enabled ||
			!kawarpInstance ||
			!isDesktop ||
			isReducedMotion ||
			document.hidden
		) {
			return
		}

		const dt = Math.min(
			Math.max((currentTime - lastFrameTime) / 1000, 0.001),
			0.05,
		)

		lastFrameTime = currentTime

		const analyser = player.equalizer?.analyser

		if (!analyser || !player.playing) {
			bassEnergy = smooth(bassEnergy, 0, 4, dt)
			beatEnergy = smooth(beatEnergy, 0, 6, dt)

			kawarpInstance.warpIntensity = smooth(
				kawarpInstance.warpIntensity,
				warpIntensity,
				4,
				dt,
			)

			kawarpInstance.animationSpeed = smooth(
				kawarpInstance.animationSpeed,
				activeAnimationSpeed,
				4,
				dt,
			)

			kawarpInstance.scale = smooth(
				kawarpInstance.scale,
				scale,
				4,
				dt,
			)

			return
		}

		/**
		 * Reuse the same frequency buffer.
		 */
		const bufferLength = analyser.frequencyBinCount

		if (!analyserData || analyserData.length !== bufferLength) {
			analyserData = new Uint8Array(bufferLength)
		}

		analyser.getByteFrequencyData(analyserData)

		/**
		 * Focus on the low-end.
		 *
		 * 30Hz -> 150Hz gives a useful bass range while avoiding
		 * some low-frequency rumble.
		 */
		const sampleRate = analyser.context?.sampleRate ?? 44100
		const nyquist = sampleRate / 2
		const binHz = nyquist / bufferLength

		const lowBin = Math.max(
			0,
			Math.floor(30 / binHz),
		)

		const highBin = Math.min(
			bufferLength,
			Math.ceil(150 / binHz),
		)

		let sum = 0

		for (let i = lowBin; i < highBin; i++) {
			sum += analyserData[i] ?? 0
		}

		const count = Math.max(1, highBin - lowBin)

		const rawBass = sum / count / 255

		/**
		 * Bass envelope.
		 *
		 * Fast attack.
		 * Slow release.
		 *
		 * This makes kicks feel responsive without making the
		 * artwork twitch constantly.
		 */
		const attack = 20
		const release = 5

		smoothedBass = smooth(
			smoothedBass,
			rawBass,
			rawBass > smoothedBass ? attack : release,
			dt,
		)

		/**
		 * Beat detection.
		 *
		 * Only trigger when bass rises meaningfully above the
		 * current threshold.
		 */
		const beatTrigger =
			smoothedBass > 0.28 &&
			smoothedBass > beatThreshold * 1.08

		if (beatTrigger) {
			beatEnergy = Math.min(
				1,
				beatEnergy + smoothedBass * 0.65,
			)

			beatThreshold = smoothedBass
		}

		beatEnergy = smooth(
			beatEnergy,
			0,
			9,
			dt,
		)

		beatThreshold = smooth(
			beatThreshold,
			smoothedBass * 0.85,
			2.5,
			dt,
		)

		/**
		 * Combine continuous bass and transient beat energy.
		 */
		bassEnergy = smooth(
			bassEnergy,
			smoothedBass,
			8,
			dt,
		)

		/**
		 * Keep the actual visual reaction deliberately small.
		 *
		 * Large multipliers are what tend to make album artwork
		 * look like it's shaking instead of flowing.
		 */
		const visualEnergy =
			bassEnergy * 0.65 +
			beatEnergy * 0.35

		const targetWarp =
			warpIntensity +
			visualEnergy * 0.22

		const targetSpeed =
			activeAnimationSpeed +
			visualEnergy * 0.45

		const targetScale =
			scale +
			visualEnergy * 0.018

		/**
		 * Final visual smoothing.
		 */
		kawarpInstance.warpIntensity = smooth(
			kawarpInstance.warpIntensity,
			targetWarp,
			7,
			dt,
		)

		kawarpInstance.animationSpeed = smooth(
			kawarpInstance.animationSpeed,
			targetSpeed,
			6,
			dt,
		)

		kawarpInstance.scale = smooth(
			kawarpInstance.scale,
			targetScale,
			8,
			dt,
		)
	}

	const startAudioLoop = () => {
		if (
			animationFrameId !== null ||
			!enabled ||
			!kawarpInstance ||
			!isDesktop ||
			isReducedMotion
		) {
			return
		}

		lastFrameTime = performance.now()

		const frame = (time: number) => {
			animationFrameId = requestAnimationFrame(frame)

			updateAudioReaction(time)
		}

		animationFrameId = requestAnimationFrame(frame)
	}

	const stopAudioLoop = () => {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId)
			animationFrameId = null
		}

		resetAudioState()
	}

	onMount(() => {
		/**
		 * Use media queries instead of UA sniffing.
		 *
		 * This also handles tablets/browsers much more reliably.
		 */
		const desktopQuery = window.matchMedia(
			'(min-width: 768px) and (pointer: fine)',
		)

		const updateDesktopState = () => {
			isDesktop = desktopQuery.matches
		}

		updateDesktopState()

		desktopQuery.addEventListener(
			'change',
			updateDesktopState,
		)

		if (!canvasElement || !isDesktop) {
			return () => {
				desktopQuery.removeEventListener(
					'change',
					updateDesktopState,
				)
			}
		}

		let resizeObserver: ResizeObserver | null = null

		try {
			kawarpInstance = new Kawarp(
				canvasElement,
				{
					warpIntensity,
					blurPasses,
					animationSpeed: activeAnimationSpeed,
					transitionDuration,
					saturation,
					tintColor: activeTintColor,
					tintIntensity,
					dithering,
					scale,
				},
			)

			resizeObserver = new ResizeObserver(() => {
				kawarpInstance?.resize()
			})

			resizeObserver.observe(canvasElement)

			/**
			 * Pause our audio RAF when the tab isn't visible.
			 */
			const handleVisibilityChange = () => {
				if (document.hidden) {
					stopAudioLoop()
				} else if (
					player.playing &&
					enabled
				) {
					startAudioLoop()
				}
			}

			document.addEventListener(
				'visibilitychange',
				handleVisibilityChange,
			)

			/**
			 * Initial artwork.
			 */
			if (imageUrl) {
				const loadId = ++imageLoadId

				currentLoadedUrl = imageUrl

				loadKawarpImage(
					kawarpInstance,
					imageUrl,
				)
					.then(() => {
						if (loadId !== imageLoadId) return

						isLoaded = true

						if (enabled) {
							kawarpInstance?.start()
						}
					})
					.catch((error) => {
						if (loadId !== imageLoadId) return

						console.error(
							'Failed to load Kawarp artwork:',
							error,
						)

						isLoaded = false
					})
			} else if (enabled) {
				kawarpInstance.start()
			}

			return () => {
				document.removeEventListener(
					'visibilitychange',
					handleVisibilityChange,
				)

				desktopQuery.removeEventListener(
					'change',
					updateDesktopState,
				)

				resizeObserver?.disconnect()

				stopAudioLoop()

				kawarpInstance?.stop()
				kawarpInstance?.dispose()

				kawarpInstance = null
				analyserData = null
			}
		} catch (error) {
			console.error(
				'Failed to initialize Kawarp:',
				error,
			)

			return () => {
				desktopQuery.removeEventListener(
					'change',
					updateDesktopState,
				)

				stopAudioLoop()

				kawarpInstance?.dispose()
				kawarpInstance = null
			}
		}
	})

	/**
	 * Update Kawarp options when props/theme change.
	 */
	$effect(() => {
		if (!kawarpInstance || !isDesktop) return

		kawarpInstance.setOptions({
			warpIntensity,
			blurPasses,
			animationSpeed: activeAnimationSpeed,
			transitionDuration,
			saturation,
			tintColor: activeTintColor,
			tintIntensity,
			dithering,
			scale,
		})
	})

	/**
	 * Audio loop lifecycle.
	 */
	$effect(() => {
		if (
			enabled &&
			isDesktop &&
			player.playing &&
			!isReducedMotion
		) {
			startAudioLoop()
		} else {
			stopAudioLoop()
		}
	})

	/**
	 * Artwork transitions.
	 */
	$effect(() => {
		if (!kawarpInstance || !isDesktop) return

		if (!imageUrl) {
			isLoaded = false
			currentLoadedUrl = null
			imageLoadId++

			kawarpInstance.stop()

			return
		}

		if (imageUrl === currentLoadedUrl) return

		const loadId = ++imageLoadId

		currentLoadedUrl = imageUrl
		isLoaded = false

		loadKawarpImage(
			kawarpInstance,
			imageUrl,
		)
			.then(() => {
				/**
				 * Ignore stale artwork requests.
				 */
				if (loadId !== imageLoadId) return

				isLoaded = true

				if (enabled) {
					kawarpInstance?.start()
				}
			})
			.catch((error) => {
				if (loadId !== imageLoadId) return

				console.error(
					'Failed to load Kawarp artwork:',
					error,
				)

				isLoaded = false
			})
	})

	/**
	 * Enable / disable.
	 */
	$effect(() => {
		if (!kawarpInstance || !isDesktop) return

		if (enabled && isLoaded) {
			kawarpInstance.start()
		} else {
			kawarpInstance.stop()
		}
	})
</script>

<div
	class="kawarp-background"
	class:is-visible={isLoaded && enabled && isDesktop}
	aria-hidden="true"
>
	<canvas bind:this={canvasElement}></canvas>

	<div class="kawarp-overlay"></div>
</div>

<style lang="postcss">
	@reference '../../app.css';

	.kawarp-background {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;

		overflow: hidden;
		pointer-events: none;

		z-index: 0;

		opacity: 0;

		transition:
			opacity 700ms cubic-bezier(0.16, 1, 0.3, 1);

		transform: translate3d(0, 0, 0);
		backface-visibility: hidden;

		contain: strict;
	}

	.kawarp-background.is-visible {
		opacity: 1;
	}

	.kawarp-background canvas {
		display: block;

		width: 100%;
		height: 100%;

		pointer-events: none;

		/**
		 * Tiny overscan prevents warped pixels from revealing
		 * the canvas edges.
		 */
		transform: scale(1.025);

		transform-origin: center;

		backface-visibility: hidden;
	}

	.kawarp-overlay {
		position: absolute;
		inset: 0;

		pointer-events: none;

		z-index: 1;

		transition:
			background 600ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	:global(.dark) .kawarp-overlay {
		background:
			radial-gradient(
				circle at 50% 30%,
				transparent 15%,
				rgb(0 0 0 / 0.28) 100%
			),
			linear-gradient(
				to bottom,
				rgb(0 0 0 / 0.08) 0%,
				rgb(0 0 0 / 0.48) 100%
			);
	}

	:global(html:not(.dark)) .kawarp-overlay {
		background:
			radial-gradient(
				circle at 50% 30%,
				transparent 15%,
				rgb(255 255 255 / 0.18) 100%
			),
			linear-gradient(
				to bottom,
				rgb(255 255 255 / 0.28) 0%,
				rgb(255 255 255 / 0.72) 100%
			);
	}

	@media (prefers-reduced-motion: reduce) {
		.kawarp-background {
			transition: opacity 300ms ease;
		}
	}
</style>
