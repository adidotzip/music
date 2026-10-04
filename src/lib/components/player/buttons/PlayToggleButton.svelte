<script lang="ts">
	import { onMount } from 'svelte'

	const player = usePlayer()

	let button: HTMLButtonElement
	let setPlayerIcon: ((el: HTMLButtonElement, name: 'play' | 'pause') => void) | undefined
	let aeroReady = false

	function syncIcon() {
		if (!button || !setPlayerIcon) return
		setPlayerIcon(button, player.playing ? 'pause' : 'play')
	}

	onMount(() => {
		let handlePress: (() => void) | undefined
		let cancelled = false

		void import('https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js')
			.then((aero) => {
				if (cancelled) return
				setPlayerIcon = aero.setPlayerIcon
				aero.initPlayerButton(button)
				aeroReady = true
				syncIcon()
				handlePress = () => { void player.togglePlay() }
				button.addEventListener('pressend', handlePress)
			})
			.catch(() => {
				// AeroUI is optional. The native click handler below keeps playback working offline.
			})

		return () => {
			cancelled = true
			if (handlePress) button.removeEventListener('pressend', handlePress)
		}
	})

	$effect(() => {
		player.playing
		syncIcon()
	})
</script>

<button
	bind:this={button}
	type="button"
	class="aero-player"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
	onclick={() => {
		if (!aeroReady) void player.togglePlay()
	}}
></button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player {
		--player-size: --spacing(11);
		--player-icon: --spacing(6);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		color: var(--color-onSecondaryContainer);
	}

	:global(#mini-player .aero-player) {
		--player-size: --spacing(11);
		--player-icon: --spacing(6);
	}
</style>
