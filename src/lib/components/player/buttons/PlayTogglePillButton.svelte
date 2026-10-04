<script lang="ts">
	import Icon from '$lib/components/icon/Icon.svelte'

	const player = usePlayer()
</script>

<button
	type="button"
	class="aero-player"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
	onclick={() => player.togglePlay()}
>
	{#if player.playing}
		<svg class="size-7 fill-current" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
		</svg>
	{:else}
		<Icon type="play" class="size-7" />
	{/if}
</button>

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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
	}
</style>
