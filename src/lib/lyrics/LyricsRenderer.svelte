<script lang="ts">
	import { browser } from '$app/environment'
	import '@braccato/core/styles/variables.css'
	import '@braccato/core/styles/lyrics.css'
	import '@braccato/core/styles/instrumental.css'
	import type { Lyric } from '@braccato/parsers'
	import { getLocale } from '$paraglide/runtime'

	interface Props {
		lyrics: Lyric[] | null
		audioElement: HTMLAudioElement | null
		class?: string
	}

	let { lyrics, audioElement, class: className }: Props = $props()

	let el:
		| (HTMLElement & {
				lyrics: Lyric[] | null
				source: HTMLAudioElement | string | null
				renderer: any
		  })
		| undefined = $state()

	let previousLyrics: Lyric[] | null = null

	if (browser) {
		void import('@braccato/core/element')
	}

	$effect(() => {
		if (!el) return

		if (lyrics !== previousLyrics) {
			previousLyrics = lyrics
			el.lyrics = lyrics
		}
	})

	$effect(() => {
		if (!el) return

		if (el.source !== audioElement) {
			el.source = audioElement
		}
	})

	// Inject secondary lyrics (translations/romanizations) & agent alignment tags
	$effect(() => {
		if (!el) return

		const handleLoaded = async () => {
			const { injectTranslation, injectRomanization } = await import('@braccato/core')
			const renderer = el.renderer
			if (!renderer || !renderer.lines || !lyrics) return

			let requiresRelayout = false
			for (const [index, line] of renderer.lines.entries()) {
				const item = lyrics[index]
				if (!item) continue

				// Set singer alignment attribute
				if (item.agent) {
					line.lyricElement.setAttribute('data-agent', item.agent)
					// Also set directly as class for maximum CSS priority
					line.lyricElement.classList.add(`agent-${item.agent}`)
				}

				// Inject translation
				const isChinese = getLocale().startsWith('zh')
				if (item.translation?.text && isChinese) {
					injectTranslation(document, line.lyricElement, item.translation.text)
					requiresRelayout = true
				}

				// Inject romanization
				if (item.romanization) {
					injectRomanization(
						document,
						line.lyricElement,
						line,
						item.romanization,
						item.timedRomanization
					)
					requiresRelayout = true
				}
			}

			if (requiresRelayout) {
				renderer.relayout()
			}
		}

		el.addEventListener('braccato:lyrics-loaded', handleLoaded)
		if (el.renderer && el.renderer.lines) {
			void handleLoaded()
		}

		return () => {
			el.removeEventListener('braccato:lyrics-loaded', handleLoaded)
		}
	})
</script>

<braccato-lyrics bind:this={el} class={className} />

<style lang="postcss">
	@reference "../../app.css";

	braccato-lyrics {
		display: block;
		width: 100%;
		height: 100%;
		overflow-y: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	braccato-lyrics::-webkit-scrollbar {
		display: none;
	}

	:global(.blyrics-container) {
		font-family: var(--font-sans);
		text-align: start;

		padding-top: var(--blyrics-padding-top, 50vh);
		padding-bottom: var(--blyrics-padding-bottom, 50vh);

		--blyrics-font-size: 2.25rem;
		--blyrics-line-height: 1.35;
		--blyrics-padding: 1.25rem;

		--blyrics-scale: 0.97;
		--blyrics-active-scale: 1.02;
		--blyrics-lyric-scroll-duration: 900ms;

		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(0, 0, 0, 0.45));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #140c0b);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(0, 0, 0, 0.12));

		contain: layout paint;
	}

	@media (width >= 640px) {
		:global(.blyrics-container) {
			--blyrics-font-size: 2.85rem;
			--blyrics-padding: 1.5rem;
		}
	}

	@media (width >= 1024px) {
		:global(.blyrics-container) {
			--blyrics-font-size: 3.5rem;
			--blyrics-padding: 1.75rem;
		}
	}

	:global(.dark .blyrics-container),
	:global([data-theme='dark'] .blyrics-container) {
		--blyrics-lyric-inactive-color: rgba(255, 255, 255, 0.45);
		--blyrics-lyric-active-color: #ffffff;
		--blyrics-glow-color: rgba(255, 255, 255, 0.15);
	}

	/* Base line overrides */
	:global(braccato-lyrics .blyrics--line) {
		display: block !important;
		width: 100% !important;
		box-sizing: border-box !important;
		font-weight: 800;
		letter-spacing: -0.025em;
		will-change: transform;
	}

	:global(.blyrics--translated) {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.65em;
		font-weight: 600;
		color: var(--lyric-translation, rgba(0, 0, 0, 0.65));
	}

	:global(.blyrics--romanized) {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.55em;
		font-weight: 500;
		color: var(--lyric-romanization, rgba(0, 0, 0, 0.5));
	}

	:global(.dark .blyrics--translated),
	:global([data-theme='dark'] .blyrics--translated) {
		color: var(--lyric-translation, rgba(255, 255, 255, 0.85));
	}

	:global(.dark .blyrics--romanized),
	:global([data-theme='dark'] .blyrics--romanized) {
		color: var(--lyric-romanization, rgba(255, 255, 255, 0.65));
	}

	/* Specificity fix using element scope & class fallback */
	:global(braccato-lyrics .blyrics--line[data-agent='v1']),
	:global(braccato-lyrics .blyrics--line[data-agent='v1000']),
	:global(braccato-lyrics .blyrics--line.agent-v1),
	:global(braccato-lyrics .blyrics--line.agent-v1000) {
		text-align: start !important;
		padding-inline-end: 1.5rem !important;
		padding-inline-start: 0 !important;
	}

	:global(braccato-lyrics .blyrics--line[data-agent='v2']),
	:global(braccato-lyrics .blyrics--line[data-agent='v3']),
	:global(braccato-lyrics .blyrics--line.agent-v2),
	:global(braccato-lyrics .blyrics--line.agent-v3) {
		text-align: end !important;
		padding-inline-start: 1.5rem !important;
		padding-inline-end: 0 !important;
	}
</style>
