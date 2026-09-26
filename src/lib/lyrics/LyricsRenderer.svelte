<script lang="ts">
	import { browser } from '$app/environment'

	interface Props {
		ttml: string | null
		audioElement: HTMLAudioElement | null
		songTitle?: string
		songArtist?: string
		songAlbum?: string
		songDurationMs?: number
		query?: string
		class?: string
	}

	let {
		ttml,
		audioElement,
		class: className,
	}: Props = $props()

	let el: HTMLElement | undefined = $state()
	let braccatoReady = $state(false)

	const CORE_URL = 'https://cdn.jsdelivr.net/npm/@braccato/core@1.11.0/+esm'
	const PARSERS_URL = 'https://cdn.jsdelivr.net/npm/@braccato/parsers@0.2.3/+esm'
	const CSS_URLS = [
		'https://cdn.jsdelivr.net/npm/@braccato/core@1.11.0/styles/variables.css',
		'https://cdn.jsdelivr.net/npm/@braccato/core@1.11.0/styles/lyrics.css',
		'https://cdn.jsdelivr.net/npm/@braccato/core@1.11.0/styles/instrumental.css',
	]

	async function ensureBraccato() {
		if (!browser || braccatoReady) return

		for (const href of CSS_URLS) {
			if (!document.querySelector(`link[data-braccato-style="${href}"]`)) {
				const link = document.createElement('link')
				link.rel = 'stylesheet'
				link.href = href
				link.dataset.braccatoStyle = href
				document.head.appendChild(link)
			}
		}

		await import(/* @vite-ignore */ CORE_URL)
		braccatoReady = true
	}

	async function renderLyrics() {
		if (!browser || !el || !ttml) return

		try {
			await ensureBraccato()
			if (!el) return

			const { detectParser } = await import(/* @vite-ignore */ PARSERS_URL)
			const durationMs = audioElement?.duration && Number.isFinite(audioElement.duration)
				? audioElement.duration * 1000
				: undefined
			const lyrics = detectParser(ttml).parse(ttml, durationMs)

			;(el as any).lyrics = lyrics
		} catch {
			// Keep the existing lyrics view empty if Braccato cannot be loaded.
		}
	}

	$effect(() => {
		void renderLyrics()
	})

	$effect(() => {
		const currentEl = el
		const currentAudio = audioElement
		if (!(currentEl && currentAudio)) return

		let frameId = 0

		const updateTime = () => {
			;(currentEl as any).currentTime = currentAudio.currentTime
			;(currentEl as any).playing = !currentAudio.paused
			if (!currentAudio.paused) frameId = requestAnimationFrame(updateTime)
		}

		const handleTimeUpdate = () => {
			;(currentEl as any).currentTime = currentAudio.currentTime
			;(currentEl as any).playing = !currentAudio.paused
		}

		const handlePlay = () => {
			;(currentEl as any).playing = true
			frameId = requestAnimationFrame(updateTime)
		}

		const handlePause = () => {
			;(currentEl as any).playing = false
			if (frameId) cancelAnimationFrame(frameId)
		}

		currentAudio.addEventListener('timeupdate', handleTimeUpdate)
		currentAudio.addEventListener('play', handlePlay)
		currentAudio.addEventListener('pause', handlePause)

		if (!currentAudio.paused) frameId = requestAnimationFrame(updateTime)

		return () => {
			currentAudio.removeEventListener('timeupdate', handleTimeUpdate)
			currentAudio.removeEventListener('play', handlePlay)
			currentAudio.removeEventListener('pause', handlePause)
			if (frameId) cancelAnimationFrame(frameId)
		}
	})

	$effect(() => {
		const currentEl = el
		if (!currentEl) return

		const handleLineClick = (event: Event) => {
			const customEvent = event as CustomEvent<{ timeS?: number; timestamp?: number }>
			const timeS = customEvent.detail?.timeS
			const timestamp = customEvent.detail?.timestamp

			if (audioElement && typeof timeS === 'number') {
				audioElement.currentTime = timeS
			} else if (audioElement && typeof timestamp === 'number') {
				audioElement.currentTime = timestamp / 1000
			}
		}

		currentEl.addEventListener('braccato:line-click', handleLineClick)
		currentEl.addEventListener('line-click', handleLineClick)

		return () => {
			currentEl.removeEventListener('braccato:line-click', handleLineClick)
			currentEl.removeEventListener('line-click', handleLineClick)
		}
	})
</script>

<braccato-lyrics
	bind:this={el}
	class={className}
	style="display: block; width: 100%; height: 100%; overflow-y: auto; scrollbar-width: none;"
></braccato-lyrics>

<style lang="postcss">
	@reference "../../app.css";

	braccato-lyrics {
		display: block;
		width: 100%;
		height: 100%;
		overflow-y: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		scroll-behavior: auto !important;
		transform: translateZ(0);

		--blyrics-lyric-active-color: var(--lyric-active-fill, #ffffff);
		--blyrics-lyric-inactive-color: rgb(255 255 255 / 0.42);
		--blyrics-font-size: 34px;
	}

	braccato-lyrics::-webkit-scrollbar {
		display: none;
	}
</style>
