<script lang="ts">
	import { browser } from '$app/environment'
	import '@braccato/core/styles/variables.css'
	import '@braccato/core/styles/lyrics.css'
	import '@braccato/core/styles/instrumental.css'
	import type { Lyric } from '@braccato/parsers'

	interface Props {
		lyrics: Lyric[] | null
		audioElement: HTMLAudioElement | null
		class?: string
	}

	let { lyrics, audioElement, class: className }: Props = $props()

	let el: (HTMLElement & { lyrics: Lyric[] | null; source: HTMLAudioElement | string | null }) | undefined = $state()

	if (browser) {
		import('@braccato/core/element')
	}

	$effect(() => {
		if (el) {
			el.lyrics = lyrics
		}
	})

	$effect(() => {
		if (el) {
			el.source = audioElement
		}
	})
</script>

<braccato-lyrics bind:this={el} class={className}></braccato-lyrics>

<style lang="postcss">
	@reference "../../app.css";

	braccato-lyrics {
		display: block;
		width: 100%;
		height: 100%;
		overflow-y: auto;
		scrollbar-width: none; /* Hide scrollbar for premium aesthetic */
		-webkit-overflow-scrolling: touch;
	}

	braccato-lyrics::-webkit-scrollbar {
		display: none;
	}

	/* Align with Adi Music's premium typography, spacing, and colors */
	:global(.blyrics-container) {
		padding-top: var(--blyrics-padding-top, 50vh) !important;
		padding-bottom: var(--blyrics-padding-bottom, 50vh) !important;
		font-family: var(--font-sans);
		text-align: left;
		--blyrics-font-size: 2.25rem;
		--blyrics-line-height: 1.35;
		--blyrics-padding: 1.25rem;

		@media (width >= 640px) {
			--blyrics-font-size: 2.85rem;
			--blyrics-padding: 1.5rem;
		}

		@media (width >= 1024px) {
			--blyrics-font-size: 3.5rem;
			--blyrics-padding: 1.75rem;
		}

		/* Smooth, premium padding transitions */
		transition: padding 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);

		/* --- PREMIUM NATIVE BRACCATO ANIMATION CONFIG --- */
		/* Hardware-accelerated native line scaling / zoom on active */
		--blyrics-scale: 0.92;
		--blyrics-active-scale: 1.05;
		--blyrics-scale-transition-duration: 450ms;
		--blyrics-line-enter-easing: cubic-bezier(0.2, 0.8, 0.2, 1);
		--blyrics-line-exit-easing: cubic-bezier(0.2, 0.8, 0.2, 1);

		/* Premium continuous gliding scroll transitions (comparable to Spotify / Apple Music) */
		--blyrics-lyric-scroll-duration: 750ms;
		--blyrics-lyric-scroll-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);

		/* Premium word-by-word highlights and swiping transitions */
		--blyrics-lyric-highlight-fade-in-duration: 250ms;
		--blyrics-lyric-highlight-fade-out-duration: 450ms;
		--blyrics-lyric-highlight-fade-in-easing: cubic-bezier(0.2, 0.8, 0.2, 1);
		--blyrics-lyric-highlight-fade-out-easing: cubic-bezier(0.2, 0.8, 0.2, 1);

		--blyrics-highlight-swipe-easing: cubic-bezier(0.2, 0.8, 0.2, 1);
		--blyrics-highlight-swipe-start-from: -0.15;
		--blyrics-highlight-swipe-end-from: -0.05;
		--blyrics-highlight-swipe-start-to: 1.35;
		--blyrics-highlight-swipe-end-to: 1.45;

		/* Exquisite, ultra-subtle and stable word wobble */
		--blyrics-wobble-duration: 500ms;
		--blyrics-word-wobble-transform-from: scale(1);
		--blyrics-word-wobble-transform-peak: scale(1.015);
		--blyrics-word-wobble-transform-settle: scale(1);
		--blyrics-word-wobble-transform-to: scale(1);
		--blyrics-word-wobble-easing: cubic-bezier(0.2, 0.8, 0.2, 1);
		--blyrics-word-wobble-peak-easing: cubic-bezier(0.2, 0.8, 0.2, 1);
		--blyrics-word-wobble-end-easing: cubic-bezier(0.2, 0.8, 0.2, 1);

		/* Fluid instrumental wave oscillations */
		--blyrics-instrumental-fill-fade-duration: 300ms;
		--blyrics-instrumental-fill-fade-easing: cubic-bezier(0.2, 0.8, 0.2, 1);
		--blyrics-instrumental-wave-oscillation-duration: 1.5s;
		--blyrics-instrumental-wave-oscillation-easing: cubic-bezier(0.25, 1, 0.5, 1);
	}

	/* Map Adi Music's CSS design tokens to Braccato variables */
	:global(.blyrics-container) {
		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(0, 0, 0, 0.35));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #140c0b);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(0, 0, 0, 0.12));
	}

	/* Handle dark mode or dark backgrounds natively */
	:global(.dark .blyrics-container),
	:global([data-theme="dark"] .blyrics-container) {
		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(255, 255, 255, 0.35));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #f1dedc);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(255, 255, 255, 0.22));
	}

	/* Fade out inactive lines and highlight active line elegantly
	   NOTE: We explicitly omit transitioning 'transform' or 'translate' in CSS
	   to prevent any conflict with WAAPI (Web Animations API) native scrolling. */
	:global(.blyrics--line) {
		font-weight: 800;
		letter-spacing: -0.025em;
		transition:
			opacity 0.600s cubic-bezier(0.2, 0.8, 0.2, 1),
			filter 0.600s cubic-bezier(0.2, 0.8, 0.2, 1);
		opacity: 0.35;
		filter: blur(1.5px);
		will-change: opacity, filter;
	}

	:global(.blyrics--active) {
		opacity: 1 !important;
		filter: blur(0px) !important;
	}

	/* Make sure active word gets perfect contrast and transition */
	:global(.blyrics--word) {
		transition: color 0.3s ease;
	}

	/* Elegant translated and romanized lyrics formatting with seamless fade-in/fade-out */
	:global(.blyrics--translated) {
		font-size: 0.65em !important;
		font-weight: 600 !important;
		color: var(--lyric-translation, rgba(0, 0, 0, 0.65)) !important;
		margin-top: 0.25rem !important;
		display: block !important;
		transition: opacity 0.600s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
	}

	:global(.blyrics--romanized) {
		font-size: 0.55em !important;
		font-weight: 500 !important;
		color: var(--lyric-romanization, rgba(0, 0, 0, 0.5)) !important;
		margin-top: 0.15rem !important;
		display: block !important;
		transition: opacity 0.600s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
	}

	/* Handle dark mode or dark backgrounds natively for translated/romanized */
	:global(.dark .blyrics--translated),
	:global([data-theme="dark"] .blyrics--translated) {
		color: var(--lyric-translation, rgba(255, 255, 255, 0.85)) !important;
	}

	:global(.dark .blyrics--romanized),
	:global([data-theme="dark"] .blyrics--romanized) {
		color: var(--lyric-romanization, rgba(255, 255, 255, 0.65)) !important;
	}
</style>
