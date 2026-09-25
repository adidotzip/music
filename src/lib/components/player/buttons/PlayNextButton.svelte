<script lang="ts">
	import PlayPreviousNextIcon from '../../animated-icons/PlayPreviousNextIcon.svelte'
	import { onMount } from 'svelte'

	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()
	let button: HTMLButtonElement

	onMount(async () => {
		const { initPlayerButton } = await import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'
		)
		initPlayerButton(button)
	})
</script>

<button
	bind:this={button}
	type="button"
	class={['aero-player aero-transport-button', className]}
	aria-label={m.playerPlayNextTrack()}
	disabled={player.isQueueEmpty}
	onclick={player.playNext}
>
	<PlayPreviousNextIcon type="next" />
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-transport-button {
		--player-size: --spacing(11);
		--player-icon: --spacing(6);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		color: var(--color-onSecondaryContainer);
	}
</style>
