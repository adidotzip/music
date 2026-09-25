<script lang="ts">
	import PlayPauseIcon from '../../animated-icons/PlayPauseIcon.svelte'
	import { onMount } from 'svelte'

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
	class="aero-player adi-aero-player-button"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
	onclick={() => player.togglePlay()}
>
	<PlayPauseIcon playing={player.playing} />
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.adi-aero-player-button {
		--player-size: --spacing(11);
		--player-icon: --spacing(6);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		color: var(--color-onSecondaryContainer);
	}
</style>
