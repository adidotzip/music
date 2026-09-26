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

	let { ttml, audioElement, songTitle, songArtist, songAlbum, songDurationMs, query, class: className }: Props = $props()
	let el: HTMLElement | undefined = $state()

	if (browser) {
		void import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@uimaxbai/am-lyrics@1.7.2/dist/src/am-lyrics.min.js')
	}

	$effect(() => {
		const currentEl = el
		const currentAudio = audioElement
		if (!(currentEl && currentAudio)) return

		let frameId = 0
		const updateTime = () => {
			;(currentEl as any).currentTime = currentAudio.currentTime * 1000
			if (!currentAudio.paused) frameId = requestAnimationFrame(updateTime)
		}
		const handleTimeUpdate = () => {
			;(currentEl as any).currentTime = currentAudio.currentTime * 1000
		}
		const handlePlay = () => {
			if (frameId) cancelAnimationFrame(frameId)
			frameId = requestAnimationFrame(updateTime)
		}
		const handlePause = () => {
			if (frameId) cancelAnimationFrame(frameId)
		}

		currentAudio.addEventListener('timeupdate', handleTimeUpdate)
		currentAudio.addEventListener('play', handlePlay)
		currentAudio.addEventListener('pause', handlePause)
		updateTime()

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
			const timestamp = (event as CustomEvent<{ timestamp?: number }>).detail?.timestamp
			if (audioElement && typeof timestamp === 'number') audioElement.currentTime = timestamp / 1000
		}
		currentEl.addEventListener('line-click', handleLineClick)
		return () => currentEl.removeEventListener('line-click', handleLineClick)
	})
</script>

<am-lyrics
	bind:this={el}
	ttml={ttml ?? undefined}
	song-title={songTitle}
	song-artist={songArtist}
	song-album={songAlbum}
	song-duration={songDurationMs}
	{query}
	font-family="var(--font-sans)"
	class={className}
></am-lyrics>

<style lang="postcss">
	@reference "../../app.css";

	am-lyrics {
		display: block;
		width: 100%;
		height: 100%;
		overflow-y: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		scroll-behavior: auto !important;
		transform: translateZ(0);
		--highlight-color: var(--lyric-active-fill, #ffffff);
		--am-lyrics-highlight-color: var(--lyric-active-fill, #ffffff);
		--am-lyrics-compact-font-size: 34px;
		--am-lyrics-compact-line-spacing: 24px;
	}
	am-lyrics::-webkit-scrollbar { display: none; }
</style>
