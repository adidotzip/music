<script lang="ts">
	import { onMount } from 'svelte'

	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()

	let button: HTMLButtonElement
	let skip: HTMLSpanElement

	onMount(async () => {
		const [{ initPlayerButton }, { initSkipLabel, playSkip }] = await Promise.all([
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-expect-error — remote CDN module, no type declarations available
			import('https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'),
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-expect-error — remote CDN module, no type declarations available
			import('https://nurislamaibekuly.github.io/aeroui/src/components/skip-label/skip-label.js')
		])

		initPlayerButton(button)
		initSkipLabel(skip)

		button.addEventListener('pressend', () => {
			playSkip(skip, { bouncing: true })
			player.playPrev()
		})
	})
</script>

<button
	bind:this={button}
	type="button"
	class={['aero-player', className]}
	aria-label={m.playerPlayPreviousTrack()}
	disabled={player.isQueueEmpty}
>
	<span bind:this={skip} class="aero-skip" data-direction="backward" aria-hidden="true"></span>
	<svg class="aero-fallback-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path d="M6 6h2v12H6zm3.5 6 8.5 6V6l-8.5 6z"/>
	</svg>
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player {
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 55%, transparent);
	}

	.aero-fallback-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: var(--player-label);
		pointer-events: none;
	}

	/* Hidden once AeroUI initialises the button (it injects its own icon structure) */
	.aero-player[data-aero-init] .aero-fallback-icon {
		display: none;
	}
</style>
