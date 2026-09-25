<script lang="ts">
	import { onMount } from 'svelte'

	const player = usePlayer()
	let button: HTMLButtonElement

	onMount(async () => {
		const { initPlayerButton, setPlayerIcon } = await import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'
		)

		initPlayerButton(button)
		setPlayerIcon(button, player.playing ? 'pause' : 'play')

		button.addEventListener('pressend', () => {
			player.togglePlay()
			queueMicrotask(() => {
				setPlayerIcon(button, player.playing ? 'pause' : 'play')
			})
		})
	})

	$effect(() => {
		if (!button) return
		void import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'
		).then(({ setPlayerIcon }) => {
			setPlayerIcon(button, player.playing ? 'pause' : 'play')
		})
	})
</script>

<button
	bind:this={button}
	class="aero-player"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
></button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player {
		--player-size: --spacing(18);
		--player-icon: --spacing(6);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		color: var(--color-onSecondaryContainer);
	}
</style>
