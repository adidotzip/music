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

	// Inject secondary lyrics (translations/romanizations) & artist labels
	$effect(() => {
		if (!el) return

		const handleLoaded = async () => {
			const { injectTranslation, injectRomanization } = await import('@braccato/core')
			const renderer = el.renderer
			if (!renderer || !renderer.lines || !lyrics) return

			let modified = false
			for (const [index, line] of renderer.lines.entries()) {
				const item = lyrics[index]
				if (!item) continue

				// Set singer label
				if (item.agent) {
					let label = ''
					if (item.agent === 'v1') label = 'Singer 1'
					else if (item.agent === 'v2') label = 'Singer 2'
					else if (item.agent === 'v3') label = 'Singer 3'
					else if (item.agent === 'v1000') label = 'Duet'
					else label = item.agent.toUpperCase()

					line.lyricElement.setAttribute('data-agent', item.agent)
					line.lyricElement.setAttribute('data-agent-label', label)
					modified = true
				}

				// Inject translation
				const isChinese = getLocale().startsWith('zh')
				if (item.translation?.text && isChinese) {
					injectTranslation(document, line.lyricElement, item.translation.text)
					modified = true
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
					modified = true
				}
			}

			if (modified) {
				renderer.relayout()
			}
		}

		el.addEventListener('braccato:lyrics-loaded', handleLoaded)
		// Run once on load if already loaded
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
		text-align: left;

		padding-top: var(--blyrics-padding-top, 50vh);
		padding-bottom: var(--blyrics-padding-bottom, 50vh);

		--blyrics-font-size: 2.25rem;
		--blyrics-line-height: 1.35;
		--blyrics-padding: 1.25rem;

		/* Let Braccato animate these */
		--blyrics-scale: 0.97;
		--blyrics-active-scale: 1.02;
		--blyrics-lyric-scroll-duration: 900ms;

		/* Colors */
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
		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(255, 255, 255, 0.45));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #f1dedc);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(255, 255, 255, 0.22));
	}

	/* Typography only. No animation overrides. */
	:global(.blyrics--line) {
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

	/* Multi-Singer Styling & Vocalist Labels */
	:global(.blyrics--line[data-agent]::before) {
		content: attr(data-agent-label);
		display: inline-block;
		margin-right: 0.5rem;
		font-size: 0.55em;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-sm, 0.25rem);
		vertical-align: middle;
		opacity: 0.8;
	}

	:global(.blyrics--line[data-agent="v1"]::before) {
		background: rgba(0, 0, 0, 0.05);
		color: var(--blyrics-lyric-active-color);
	}
	:global(.dark .blyrics--line[data-agent="v1"]::before),
	:global([data-theme='dark'] .blyrics--line[data-agent="v1"]::before) {
		background: rgba(255, 255, 255, 0.1);
	}

	:global(.blyrics--line[data-agent="v2"]) {
		--blyrics-lyric-active-color: #0d9488; /* teal-600 */
	}
	:global(.dark .blyrics--line[data-agent="v2"]),
	:global([data-theme='dark'] .blyrics--line[data-agent="v2"]) {
		--blyrics-lyric-active-color: #2dd4bf; /* teal-400 */
	}
	:global(.blyrics--line[data-agent="v2"]::before) {
		background: rgba(13, 148, 136, 0.1);
		color: #0d9488;
	}
	:global(.dark .blyrics--line[data-agent="v2"]::before),
	:global([data-theme='dark'] .blyrics--line[data-agent="v2"]::before) {
		background: rgba(45, 212, 191, 0.15);
		color: #2dd4bf;
	}

	:global(.blyrics--line[data-agent="v3"]) {
		--blyrics-lyric-active-color: #7c3aed; /* violet-600 */
	}
	:global(.dark .blyrics--line[data-agent="v3"]),
	:global([data-theme='dark'] .blyrics--line[data-agent="v3"]) {
		--blyrics-lyric-active-color: #a78bfa; /* violet-400 */
	}
	:global(.blyrics--line[data-agent="v3"]::before) {
		background: rgba(124, 58, 237, 0.1);
		color: #7c3aed;
	}
	:global(.dark .blyrics--line[data-agent="v3"]::before),
	:global([data-theme='dark'] .blyrics--line[data-agent="v3"]::before) {
		background: rgba(167, 139, 250, 0.15);
		color: #a78bfa;
	}

	:global(.blyrics--line[data-agent="v1000"]) {
		--blyrics-lyric-active-color: #db2777; /* pink-600 */
	}
	:global(.dark .blyrics--line[data-agent="v1000"]),
	:global([data-theme='dark'] .blyrics--line[data-agent="v1000"]) {
		--blyrics-lyric-active-color: #f472b6; /* pink-400 */
	}
	:global(.blyrics--line[data-agent="v1000"]::before) {
		background: rgba(219, 39, 119, 0.1);
		color: #db2777;
	}
	:global(.dark .blyrics--line[data-agent="v1000"]::before),
	:global([data-theme='dark'] .blyrics--line[data-agent="v1000"]::before) {
		background: rgba(244, 114, 182, 0.15);
		color: #f472b6;
	}
</style>
