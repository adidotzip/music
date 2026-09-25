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
		<span class="aero-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="currentColor">
				<rect x="5.27" y="3" width="5.45" height="18" rx="1.3" />
				<rect x="13.28" y="3" width="5.45" height="18" rx="1.3" />
			</svg>
		</span>
	{:else}
		<span class="aero-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M4 6.8 4 17.2Q4 21 7.31 19.14L18.26 12.98Q20 12 18.26 11.02L7.31 4.86Q4 3 4 6.8Z" />
			</svg>
		</span>
	{/if}
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.adi-aero-player-button {
		--player-size: --spacing(12);
		--player-icon: --spacing(6);
		--player-label: var(--color-onPrimary);
		--player-pressed: var(--color-onPrimary);
		--player-tint: color-mix(in srgb, var(--color-onPrimary) 14%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onPrimary) 38%, transparent);
		flex: 0 0 auto;
	}

	.aero-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.aero-icon > svg {
		width: var(--player-icon);
		height: var(--player-icon);
		display: block;
	}
</style>
