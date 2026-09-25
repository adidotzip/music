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
		width: --spacing(11);
		height: --spacing(11);
		padding: 0;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--color-onSecondaryContainer);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		flex: 0 0 auto;
	}

	.aero-transport-button :global(.aero-skip) {
		--skip-size: --spacing(6);
		color: currentColor;
	}
</style>
