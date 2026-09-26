<script lang="ts">
	import { ensureTrackIsStoredLocally } from '$lib/library/local-download.ts'
	import Icon from '$lib/components/icon/Icon.svelte'

	interface Props {
		trackId: number
		large?: boolean
		downloaded?: boolean
		class?: ClassValue
	}

	const { trackId, large = false, downloaded = false, class: className }: Props = $props()

	type DownloadState = 'idle' | 'loading' | 'done' | 'error'
	let state = $state<DownloadState>(downloaded ? 'done' : 'idle')

	const download = async (event: MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()

		if (state === 'loading' || state === 'done') return

		state = 'loading'
		try {
			await ensureTrackIsStoredLocally(trackId)
			state = 'done'
		} catch (error) {
			state = 'error'
			snackbar.unexpectedError(error)
			window.setTimeout(() => {
				if (state === 'error') state = 'idle'
			}, 900)
		}
	}
</script>

<button
	type="button"
	title={state === 'done' ? 'Available offline' : state === 'loading' ? 'Saving offline…' : 'Download for offline playback'}
	class={['download-button interactable', large && 'download-button-large', className]}
	aria-label={state === 'done' ? 'Downloaded for offline playback' : state === 'loading' ? 'Saving song offline' : 'Download song for offline playback'}
	aria-busy={state === 'loading'}
	disabled={state === 'loading' || state === 'done'}
	onclick={download}
>
	<span class={['download-icon', state === 'loading' && 'is-loading', state === 'done' && 'is-done']}>
		{#if state === 'done'}
			<Icon type="check" />
		{:else}
			<Icon type="download" />
		{/if}
	</span>
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.download-button {
		position: relative;
		display: inline-flex;
		height: 44px;
		width: 44px;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 9999px;
		background: transparent;
		color: var(--color-onSurfaceVariant);
		cursor: pointer;
		transition:
			color 180ms var(--ease-standard),
			background-color 180ms var(--ease-standard),
			transform 180ms var(--ease-emphasized);
	}

	.download-button:hover:not(:disabled),
	.download-button:focus-visible:not(:disabled) {
		background: color-mix(in srgb, var(--color-onSurface) 8%, transparent);
		color: var(--color-onSurface);
	}

	.download-button:active:not(:disabled) {
		transform: scale(0.9);
	}

	.download-button:disabled {
		cursor: default;
	}

	.download-button-large {
		height: 52px;
		width: 52px;
	}

	.download-icon {
		display: grid;
		height: 20px;
		width: 20px;
		place-items: center;
		transform-origin: center;
		transition:
			transform 220ms var(--ease-emphasized),
			opacity 160ms var(--ease-standard);
	}

	.download-button-large .download-icon {
		height: 24px;
		width: 24px;
	}

	.download-icon.is-loading {
		animation: download-spin 700ms linear infinite;
		opacity: 0.7;
	}

	.download-icon.is-done {
		animation: download-complete 260ms var(--ease-emphasized) both;
		color: var(--color-primary);
	}

	@keyframes download-spin {
		from {
			transform: rotate(0deg) scale(0.92);
		}
		50% {
			transform: rotate(180deg) scale(1.05);
		}
		to {
			transform: rotate(360deg) scale(0.92);
		}
	}

	@keyframes download-complete {
		0% {
			transform: scale(0.55) rotate(-18deg);
			opacity: 0;
		}
		65% {
			transform: scale(1.12) rotate(4deg);
			opacity: 1;
		}
		100% {
			transform: scale(1) rotate(0deg);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.download-icon.is-loading,
		.download-icon.is-done {
			animation: none;
		}
	}

	.download-button:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
