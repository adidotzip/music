<script lang="ts">
	import { onMount } from 'svelte'

	const player = usePlayer()

	let button: HTMLButtonElement

	const updateIcon = async () => {
		if (!button) return

		const { setPlayerIcon } = await import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'
		)

		setPlayerIcon(button, player.playing ? 'pause' : 'play')
	}

	onMount(() => {
		void updateIcon()
	})

	$effect(() => {
		player.playing
		player.activeTrack
		void updateIcon()
	})
</script>

<button
	bind:this={button}
	class="aero-player adi-aero-player-button"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	aria-pressed={player.playing}
	disabled={!player.activeTrack}
	onclick={() => player.togglePlay()}
>
	<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path d="M4 6.8 4 17.2Q4 21 7.31 19.14L18.26 12.98Q20 12 18.26 11.02L7.31 4.86Q4 3 4 6.8Z" />
	</svg>
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