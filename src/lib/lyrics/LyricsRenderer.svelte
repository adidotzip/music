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

		/* Smooth, premium transitions */
		transition: padding 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	/* Map Adi Music's CSS design tokens to Braccato variables */
	:global(.blyrics-container) {
		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(0, 0, 0, 0.4));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #140c0b);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(0, 0, 0, 0.12));
	}

	/* Handle dark mode or dark backgrounds natively */
	:global(.dark .blyrics-container),
	:global([data-theme="dark"] .blyrics-container) {
		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(255, 255, 255, 0.4));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #f1dedc);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(255, 255, 255, 0.22));
	}

	/* Fade out inactive lines and highlight active line elegantly */
	:global(.blyrics--line) {
		font-weight: 800;
		letter-spacing: -0.025em;
		transition:
			opacity 0.8s cubic-bezier(0.2, 0.8, 0.2, 1),
			transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1),
			filter 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
		opacity: 0.3;
		filter: blur(1px);
		transform: scale(0.97);
	}

	:global(.blyrics--active) {
		opacity: 1 !important;
		filter: blur(0px) !important;
		transform: scale(1.03) !important;
	}

	/* Make sure active word gets perfect contrast and transition */
	:global(.blyrics--word) {
		transition: color 0.3s ease;
	}
</style>
