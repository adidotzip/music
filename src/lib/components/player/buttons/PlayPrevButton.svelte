<script lang="ts">
	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()
</script>

<button
	class={['aero-player aero-transport-button', className]}
	aria-label={m.playerPlayPreviousTrack()}
	disabled={player.isQueueEmpty}
	onclick={player.playPrev}
>
	<span class="aero-skip" data-direction="backward" data-size="24" aria-hidden="true"></span>
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-transport-button {
		--player-size: --spacing(11);
		--player-icon: --spacing(6);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 12%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		flex: 0 0 auto;
	}

	.aero-transport-button :global(.aero-skip) {
		--skip-size: --spacing(6);
		color: inherit;
	}
</style>
