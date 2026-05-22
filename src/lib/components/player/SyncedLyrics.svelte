<script lang="ts" module>
	import type { SyncedLyricsLine } from '$lib/lyrics/synced-lyrics.ts'

	type LyricItem = 
		| (SyncedLyricsLine & { type: 'line'; isSecondaryLine: boolean; words: any[]; isOpposite: boolean })
		| { type: 'break'; startTime: number; endTime: number; id: string };

	const getActiveLineIndex = (
		items: readonly LyricItem[],
		currentTimeMs: number,
	): number => {
		let index = -1
		for (let i = 0; i < items.length; i += 1) {
			if (currentTimeMs >= items[i].startTime) {
				index = i
			} else {
				break
			}
		}
		return index
	}
</script>

<script lang="ts">
	import { spring } from 'svelte/motion'
	import Button from '$lib/components/Button.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import Spinner from '$lib/components/Spinner.svelte'
	import { formatArtists, getItemLanguage } from '$lib/helpers/utils/text.ts'
	import type { TrackData } from '$lib/library/get/value.ts'
	import {
		fetchSyncedLyrics,
		type SyncedLyricsResult,
	} from '$lib/lyrics/synced-lyrics.ts'

	interface Props {
		track: TrackData | undefined
		currentTimeMs: number
		class?: string
	}

	let { track, currentTimeMs, class: className }: Props = $props()
	const player = usePlayer()

	let result: SyncedLyricsResult | undefined = $state()
	let loading = $state(false)
	let containerElement: HTMLElement | undefined = $state()
	let contentElement: HTMLElement | undefined = $state()
	let reloadCount = $state(0)
	let isUserScrolling = $state(false)
	let userScrollTimeout: ReturnType<typeof setTimeout>

	// ─── Motion & Physics ───────────────────────────────────────────────────
	const scrollOffset = spring(0, {
		stiffness: 0.04,
		damping: 0.75, 
	})

	// ─── RAF-driven smooth time (Fixed double-bounce jitter) ────────────────
	let smoothTimeMs = $state(0)
	let lastPropTime = $state(0)

	$effect(() => {
		// When the authoritative prop changes, we only snap if it's a huge difference (like a seek)
		// Otherwise, we let the RAF loop smoothly catch up to prevent backwards jitter.
		if (!player.playing) {
			smoothTimeMs = currentTimeMs
		} else {
			const diff = Math.abs(currentTimeMs - smoothTimeMs)
			if (diff > 1500) {
				smoothTimeMs = currentTimeMs
			}
		}
		lastPropTime = currentTimeMs
	})

	$effect(() => {
		let running = true
		let lastTime = performance.now()

		const tick = (now: number) => {
			if (!running) return
			const elapsed = now - lastTime
			lastTime = now

			if (player.playing) {
				// Always move forward
				smoothTimeMs += elapsed
				
				// Soft drift correction: if we fall behind the prop time, speed up slightly.
				// We intentionally do NOT correct backwards to prevent the words from double-bouncing.
				const drift = lastPropTime - smoothTimeMs
				if (drift > 200) {
					smoothTimeMs += drift * 0.15 
				}
			}
			requestAnimationFrame(tick)
		}
		
		const rafId = requestAnimationFrame(tick)
		return () => {
			running = false
			cancelAnimationFrame(rafId)
		}
	})

	const foundResult = $derived(result?.status === 'found' ? result : undefined)
	const lines = $derived(foundResult?.lines ?? [])
	
	const syncType = $derived(foundResult?.syncType ?? 'line')
	const isLineLevel = $derived(syncType === 'line')

	// ─── Process Lyrics & Inject Breaks ─────────────────────────────────────
	const processedItems = $derived.by(() => {
		const items: LyricItem[] = []
		
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i]

			if (i > 0) {
				const prevLine = lines[i - 1]
				const gap = line.startTime - prevLine.endTime
				if (gap > 3500) {
					items.push({
						type: 'break',
						startTime: prevLine.endTime,
						endTime: line.startTime,
						id: `break-${i}`
					})
				}
			}

			let inSecondary = false
			const words = line.words.map((word) => {
				let isWordSecondary = inSecondary
				if (word.string.includes('(')) {
					inSecondary = true
					isWordSecondary = true
				}
				if (word.string.includes(')')) {
					inSecondary = false
					isWordSecondary = true
				}
				return { ...word, isSecondary: isWordSecondary }
			})
			
			const lineText = words.map((w) => w.string).join('').trim()
			const isSecondaryLine = lineText.startsWith('(') && lineText.endsWith(')')

			const cleanedWords = words.map((word, idx) => {
				return {
					...word,
					string: word.string.replace(/[()]/g, ''),
					originalIndex: idx
				}
			})
			
			items.push({ 
				type: 'line', 
				...line, 
				words: cleanedWords, 
				isSecondaryLine,
				isOpposite: (line as any).isOpposite ?? false
			})
		}
		return items
	})

	const activeLineIndex = $derived(getActiveLineIndex(processedItems, smoothTimeMs))

	const getActiveWordIndex = (line: any, timeMs: number): number => {
		for (let i = line.words.length - 1; i >= 0; i -= 1) {
			if (timeMs >= line.words[i].time) return i
		}
		return -1
	}

	$effect(() => {
		if (!track) {
			result = undefined
			loading = false
			return
		}
		const requestedReloadCount = reloadCount
		const controller = new AbortController()
		loading = true

		fetchSyncedLyrics(track, controller.signal)
			.then((nextResult) => {
				if (!controller.signal.aborted && requestedReloadCount === reloadCount) {
					result = nextResult
				}
			})
			.catch((error: unknown) => {
				if (error instanceof Error && error.name === 'AbortError') return
				result = { status: 'error' }
			})
			.finally(() => {
				if (!controller.signal.aborted && requestedReloadCount === reloadCount) {
					loading = false
				}
			})

		return () => controller.abort()
	})

	const updateScrollPosition = (immediate = false) => {
		if (!containerElement || !contentElement || activeLineIndex < 0) return
		const activeEl = contentElement.querySelector<HTMLElement>(
			`[data-line-index="${activeLineIndex}"]`,
		)
		if (!activeEl) return

		const containerHeight = containerElement.offsetHeight
		const lineTop = activeEl.offsetTop
		const lineHeight = activeEl.offsetHeight

		const target = (containerHeight / 2) - lineTop - (lineHeight / 2)
		scrollOffset.set(target, { hard: immediate })
	}

	$effect(() => {
		if (!isUserScrolling) {
			updateScrollPosition()
		}
	})

	$effect(() => {
		const handleResize = () => updateScrollPosition(true)
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	})

	const handleUserInteraction = () => {
		isUserScrolling = true
		clearTimeout(userScrollTimeout)
		userScrollTimeout = setTimeout(() => {
			isUserScrolling = false
		}, 3000)
	}

	let lastTouchY = 0
	const handleTouchStart = (e: TouchEvent) => {
		lastTouchY = e.touches[0].clientY
		handleUserInteraction()
	}

	const handleTouchMove = (e: TouchEvent) => {
		const touchY = e.touches[0].clientY
		const deltaY = lastTouchY - touchY
		lastTouchY = touchY
		scrollOffset.update(v => v - deltaY, { hard: true })
	}
</script>

{#snippet emptyState(icon: 'musicNote' | 'alertCircle', title: string, description: string)}
	<div class="empty-state z-10 m-auto flex h-full max-w-80 flex-col items-center justify-center text-center opacity-50 transition-opacity duration-500">
		<Icon type={icon} class="mb-4 h-12 w-12" style="color: var(--lyric-inactive)" />
		<h3 class="text-xl font-bold" style="color: var(--lyric-active-fill)">{title}</h3>
		<p class="mt-2 text-sm" style="color: var(--lyric-inactive)">{description}</p>
	</div>
{/snippet}

<section class={["lyrics-shell w-full h-full relative overflow-hidden", !(player.animatedArtworkSrc && player.animatedArtworkLoaded) && "bg-black dark", className]} aria-live="polite">
	{#if !track}
		{@render emptyState('musicNote', 'No Track Playing', 'Play a track to follow along with the lyrics.')}
	{:else if loading}
		<div class="flex h-full w-full items-center justify-center">
			<Spinner class="h-8 w-8" style="color: var(--lyric-inactive)" />
		</div>
	{:else if result?.status === 'found'}
		<div
			class="lyrics-container absolute inset-0 h-full w-full"
			role="region"
			aria-label="Lyrics"
			bind:this={containerElement}
			onwheel={(e) => {
				handleUserInteraction()
				scrollOffset.update(v => v - e.deltaY, { hard: true })
			}}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
		>
			<div
				class="lyrics-content mx-auto w-full max-w-2xl"
				bind:this={contentElement}
				style="transform: translateY({$scrollOffset}px)"
			>
				{#each processedItems as item, itemIndex (item.type === 'break' ? item.id : itemIndex)}
					{@const isActiveLine = itemIndex === activeLineIndex}
					{@const isLinePast = itemIndex < activeLineIndex}
					{@const distance = Math.abs(itemIndex - activeLineIndex)}

					{#if item.type === 'break'}
						{@const breakDuration = item.endTime - item.startTime}
						{@const breakProgress = isActiveLine ? Math.min(Math.max((smoothTimeMs - item.startTime) / breakDuration, 0), 1) : 0}
						<div
							class="lyric-item lyric-break"
							class:active={isActiveLine}
							class:past={isLinePast}
							data-line-index={itemIndex}
							style="--distance: {distance}"
						>
							<div class="dots-container">
								<span class="dot" class:filled={breakProgress >= 0.25}></span>
								<span class="dot" class:filled={breakProgress >= 0.50}></span>
								<span class="dot" class:filled={breakProgress >= 0.75}></span>
							</div>
						</div>
					{:else}
						{@const activeWordIdx = isActiveLine ? getActiveWordIndex(item, smoothTimeMs) : -1}
						{@const primaryWords = item.words.filter(w => !w.isSecondary)}
						{@const secondaryWords = item.words.filter(w => w.isSecondary)}

						<button
							type="button"
							class="lyric-item lyric-line interactable"
							class:active={isActiveLine}
							class:past={isLinePast}
							class:secondary-line={item.isSecondaryLine}
							class:opposite={item.isOpposite}
							data-line-index={itemIndex}
							style="--distance: {distance}"
							onclick={() => {
								player.seek(item.startTime / 1000)
								isUserScrolling = false
								updateScrollPosition()
							}}
						>
							{#if isLineLevel}
								{#if primaryWords.length > 0}
									<div class="primary-lyrics-block">
										<span 
											class="lyric-word" 
											class:is-sung={isActiveLine || isLinePast} 
											class:is-current={isActiveLine}
											style="--word-progress: {isActiveLine || isLinePast ? 100 : 0}%"
										>{primaryWords.map(w => w.string).join('')}</span>
									</div>
								{/if}
								{#if secondaryWords.length > 0}
									<div class="secondary-lyrics-block">
										<span 
											class="lyric-word secondary-word" 
											class:is-sung={isActiveLine || isLinePast} 
											class:is-current={isActiveLine}
											style="--word-progress: {isActiveLine || isLinePast ? 100 : 0}%"
										>{secondaryWords.map(w => w.string).join('')}</span>
									</div>
								{/if}
							{:else}
								{#if primaryWords.length > 0}
									<div class="primary-lyrics-block">
										{#each primaryWords as word}{#if word.string.length > 0}{@const isPastWord = isLinePast || (isActiveLine && word.originalIndex < activeWordIdx)}{@const isCurrentWord = isActiveLine && word.originalIndex === activeWordIdx}{@const nextTime = item.words[word.originalIndex + 1]?.time ?? item.endTime}{@const duration = Math.max(nextTime - word.time, 1)}{@const wordProgress = isLinePast ? 100 : (isCurrentWord ? Math.min(Math.max((smoothTimeMs - word.time) / duration, 0), 1) * 100 : isPastWord ? 100 : 0)}<span class="lyric-word" class:is-sung={isPastWord || isCurrentWord} class:is-current={isCurrentWord} style="--word-progress: {wordProgress}%">{word.string}</span>{/if}{/each}
									</div>
								{/if}

								{#if secondaryWords.length > 0}
									<div class="secondary-lyrics-block">
										{#each secondaryWords as word}{#if word.string.length > 0}{@const isPastWord = isLinePast || (isActiveLine && word.originalIndex < activeWordIdx)}{@const isCurrentWord = isActiveLine && word.originalIndex === activeWordIdx}{@const nextTime = item.words[word.originalIndex + 1]?.time ?? item.endTime}{@const duration = Math.max(nextTime - word.time, 1)}{@const wordProgress = isLinePast ? 100 : (isCurrentWord ? Math.min(Math.max((smoothTimeMs - word.time) / duration, 0), 1) * 100 : isPastWord ? 100 : 0)}<span class="lyric-word secondary-word" class:is-sung={isPastWord || isCurrentWord} class:is-current={isCurrentWord} style="--word-progress: {wordProgress}%">{word.string}</span>{/if}{/each}
									</div>
								{/if}
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	{:else}
		{@render emptyState('alertCircle', 'Lyrics Unavailable', "We couldn't find synced lyrics for this track.")}
	{/if}
</section>

<style lang="postcss">
	@reference "../../../app.css";

	/* ─── Robust Light/Dark Mode Mapping ────────────────────────────── */
	.lyrics-shell {
		/* Defaults for a light environment */
		--lyric-inactive: rgba(0, 0, 0, 0.4);
		--lyric-active-fill: #000000;
		--lyric-active-unfill: rgba(0, 0, 0, 0.15);
	}

	@media (prefers-color-scheme: dark) {
		.lyrics-shell {
			--lyric-inactive: rgba(255, 255, 255, 0.5);
			--lyric-active-fill: #ffffff;
			--lyric-active-unfill: rgba(255, 255, 255, 0.25);
		}
	}

	/* Overrides: if the container gets 'bg-black' or 'dark' forcefully */
	.lyrics-shell.bg-black, :global(.dark) .lyrics-shell, .lyrics-shell.dark {
		--lyric-inactive: rgba(255, 255, 255, 0.5);
		--lyric-active-fill: #ffffff;
		--lyric-active-unfill: rgba(255, 255, 255, 0.25);
	}

	.lyrics-container {
		mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 10%,
			black 85%,
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 10%,
			black 85%,
			transparent 100%
		);
	}

	.lyrics-content {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		padding: 0 1.5rem;
		@media (min-width: 640px) { padding: 0 2rem; }
		padding-bottom: calc(env(safe-area-inset-bottom) + 60vh);
		padding-top: 50vh; 
		will-change: transform;
	}

	.lyric-item {
		display: block;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		margin: 0;
		padding: 1.25rem 0; 
		transform-origin: left center;
		will-change: transform, opacity, filter;
		
		opacity: clamp(0.1, calc(0.4 / (1 + var(--distance) * 0.4)), 1);
		transform: scale(calc(1 - var(--distance) * 0.03));
		filter: blur(calc(var(--distance) * 1.5px));
		
		transition:
			opacity 0.8s cubic-bezier(0.2, 0.8, 0.2, 1),
			transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1),
			filter 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	/* Handling multiple singers */
	.lyric-item.opposite {
		text-align: right;
		transform-origin: right center;
	}
	.lyric-break.opposite {
		justify-content: flex-end;
	}

	.lyric-line {
		font-family: var(--font-sans);
		font-size: 2.15rem;
		@media (min-width: 640px) { font-size: 2.75rem; }
		@media (min-width: 1024px) { font-size: 3.5rem; }
		font-weight: 800;
		line-height: 1.2;
		letter-spacing: -0.02em;
		white-space: pre-wrap;
		color: var(--lyric-inactive);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.lyric-item:hover {
		opacity: clamp(0.5, calc(0.6 / (1 + var(--distance) * 0.3)), 1);
	}

	.lyric-item.active {
		opacity: 1;
		transform: scale(1.02);
		filter: blur(0);
	}

	.lyric-item.past {
		opacity: clamp(0.05, calc(0.2 / (1 + var(--distance) * 0.6)), 1);
	}

	.primary-lyrics-block {
		display: block;
		width: 100%;
	}

	.secondary-lyrics-block {
		display: block;
		width: 100%;
		margin-top: 0.15em;
	}

	.lyric-line.secondary-line {
		font-size: 1.5rem;
		@media (min-width: 640px) { font-size: 1.85rem; }
		@media (min-width: 1024px) { font-size: 2.5rem; }
		font-weight: 600;
		font-style: italic;
	}

	.lyric-word.secondary-word {
		font-size: 0.85em; 
		font-style: italic;
	}

	.lyric-word {
		display: inline;
		position: relative;
		white-space: pre-wrap;
		-webkit-box-decoration-break: clone;
		box-decoration-break: clone;
		
		/* Animates up smoothly when sung via the `top` property */
		top: 0;
		transition: top 0.3s ease-out; /* Smoother curve, no bounce */
	}

	.lyric-word.is-current {
		top: -3px; /* Reduced harshness, subtle lift */
	}

	.lyric-line.active .lyric-word {
		background: linear-gradient(
			to right,
			var(--lyric-active-fill) 0%,
			var(--lyric-active-fill) var(--word-progress),
			var(--lyric-active-unfill) calc(var(--word-progress) + 5%),
			var(--lyric-active-unfill) 100%
		);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.lyric-break {
		display: flex;
		align-items: center;
		padding: 3rem 0;
	}

	.dots-container {
		display: flex;
		gap: 0.75rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background-color: var(--lyric-active-unfill);
		transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
		transform: scale(1);
	}

	.dot.filled {
		background-color: var(--lyric-active-fill);
		transform: scale(1.5);
	}
</style>
