<script lang="ts">
	const player = usePlayer()

	const handleKeydown = (event: KeyboardEvent) => {
		if (!player.activeTrack) return
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			player.togglePlay()
		}
	}
</script>

<div class="aero-player-control aero-player-control--play">
	<aero-player-button
		class="adi-aero-player-button"
		aria-label={player.playing ? m.playerPause() : m.playerPlay()}
		aria-pressed={player.playing}
		aria-disabled={!player.activeTrack}
		disabled={!player.activeTrack}
		role="button"
		tabindex={player.activeTrack ? 0 : -1}
		onclick={() => player.togglePlay()}
		onkeydown={handleKeydown}
	>
		<span slot="play" aria-hidden="true"></span>
		<span slot="pause" aria-hidden="true"></span>
	</aero-player-button>
</div>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player-control {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-onPrimary);
	}

	.adi-aero-player-button {
		--aero-button-color: var(--color-primary);
		--aero-button-foreground: var(--color-onPrimary);
		--aero-button-disabled-opacity: 0.38;
		width: --spacing(18);
		height: --spacing(11);
		border-radius: var(--radius-full);
		flex: 0 0 auto;
	}
</style>
