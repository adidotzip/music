<script lang="ts">
	const player = usePlayer()
</script>

<button
	class="aero-player adi-aero-player-button"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	aria-pressed={player.playing}
	disabled={!player.activeTrack}
	onclick={() => player.togglePlay()}
>
	{#if player.playing}
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<rect x="5.27" y="3" width="5.45" height="18" rx="1.3" />
			<rect x="13.28" y="3" width="5.45" height="18" rx="1.3" />
		</svg>
	{:else}
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M4 6.8 4 17.2Q4 21 7.31 19.14L18.26 12.98Q20 12 18.26 11.02L7.31 4.86Q4 3 4 6.8Z" />
		</svg>
	{/if}
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.adi-aero-player-button {
		width: --spacing(18);
		height: --spacing(10);
		padding: 0;
		border-radius: var(--radius-full);
		background-color: var(--color-primary);
		color: var(--color-onPrimary);
		--player-label: var(--color-onPrimary);
		--player-pressed: var(--color-onPrimary);
		--player-tint: var(--color-primary);
		--player-disabled: color-mix(in srgb, var(--color-onPrimary) 38%, transparent);
		flex: 0 0 auto;
	}

	.adi-aero-player-button :global(.aero-player-label) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.adi-aero-player-button :global(.aero-player-label > svg) {
		width: --spacing(6);
		height: --spacing(6);
		display: block;
	}

	.adi-aero-player-button:disabled {
		background-color: var(--color-primary);
	}
</style>
