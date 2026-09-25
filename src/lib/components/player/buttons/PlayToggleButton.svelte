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

		button.addEventListener('pressend', handlePress)
	})

	function handlePress() {
		player.togglePlay()
	}

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
>
	<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path d="M4 6.8 4 17.2Q4 21 7.31 19.14L18.26 12.98Q20 12 18.26 11.02L7.31 4.86Q4 3 4 6.8Z" />
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
</style>
