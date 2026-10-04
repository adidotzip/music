<script lang="ts">
	import Icon from '$lib/components/icon/Icon.svelte'

	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()
</script>

<button
	type="button"
	class={['aero-player', className]}
	aria-label={m.playerPlayPreviousTrack()}
	disabled={player.isQueueEmpty}
	onclick={() => player.playPrev()}
>
	<Icon type="skipPrevious" class="size-6" />
</button>

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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
	}
</style>
