<script lang="ts">
	const player = usePlayer()
	const { class: className }: { class?: ClassValue } = $props()
</script>

<div class={['aero-skip-control', className]}>
	<aero-skip-label
		class="adi-aero-skip-label"
		direction="previous"
		label={m.playerPlayPreviousTrack()}
		disabled={player.isQueueEmpty}
		onclick={player.playPrev}
	></aero-skip-label>
</div>

<style lang="postcss">
	@reference '../../../app.css';

	.aero-skip-control {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: --spacing(11);
		height: --spacing(11);
		color: var(--color-onSecondaryContainer);
	}

	.adi-aero-skip-label {
		--aero-button-color: transparent;
		--aero-button-foreground: var(--color-onSecondaryContainer);
		--aero-button-hover-color: color-mix(in srgb, var(--color-onSecondaryContainer) 8%, transparent);
		--aero-button-active-color: color-mix(in srgb, var(--color-onSecondaryContainer) 16%, transparent);
		--aero-button-disabled-opacity: 0.38;
		width: --spacing(11);
		height: --spacing(11);
	}
</style>
