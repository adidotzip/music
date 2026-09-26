<script lang="ts">
	import Icon from '$lib/components/icon/Icon.svelte'

	const player = usePlayer()
</script>

<button data-size="compact"
	type="button"
	class="play-toggle"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
	onclick={() => player.togglePlay()}
	aria-pressed={player.playing}
>
	<Icon type={player.playing ? 'pause' : 'play'} />
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.play-toggle {
		color: var(--color-onSecondaryContainer);
		background: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition:
			transform 160ms var(--m3-easing-emphasized),
			background-color 160ms var(--m3-easing-standard);
	}

	.play-toggle:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-onSecondaryContainer) 16%, transparent);
	}

	.play-toggle:active:not(:disabled) {
		transform: scale(0.92);
	}

	.play-toggle:disabled {
		opacity: 0.38;
		cursor: default;
	}

	.play-toggle :global(svg) {
		transition: transform 160ms var(--m3-easing-standard);
	}

	.play-toggle[data-size="compact"] {
		width: --spacing(11);
		height: --spacing(11);
	}

	.play-toggle[data-size="large"] {
		width: --spacing(18);
		height: --spacing(18);
	}

	.play-toggle[data-size="large"] :global(svg) {
		width: --spacing(8);
		height: --spacing(8);
	}
</style>
