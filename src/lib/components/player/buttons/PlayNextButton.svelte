<script lang="ts">
	import { onMount } from 'svelte'

	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()

	let skip: HTMLSpanElement

	onMount(async () => {
		const { initSkipLabel } = await import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/skip-label/skip-label.js'
		)
		initSkipLabel(skip)
	})
</script>

<button
	class={['aero-player aero-transport-button', className]}
	aria-label={m.playerPlayNextTrack()}
	disabled={player.isQueueEmpty}
	onclick={player.playNext}
>
	<span
		bind:this={skip}
		class="aero-skip"
		data-direction="forward"
		data-size="24"
		aria-hidden="true"
	></span>
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	/* Keep AeroUI's native player geometry and interaction styling.
	 * Only map AeroUI's color tokens to Adi Music's theme. */
	.aero-player {
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
	}
</style>