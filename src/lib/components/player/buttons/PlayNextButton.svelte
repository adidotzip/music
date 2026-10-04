<script lang="ts">
	import { onMount } from 'svelte'

	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()
	let button: HTMLButtonElement
	let skip: HTMLSpanElement
	let aeroReady = false

	onMount(() => {
		let handlePress: (() => void) | undefined
		let cancelled = false

		void Promise.all([
			import('https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'),
			import('https://nurislamaibekuly.github.io/aeroui/src/components/skip-label/skip-label.js'),
		]).then(([playerButton, skipLabel]) => {
			if (cancelled) return
			playerButton.initPlayerButton(button)
			skipLabel.initSkipLabel(skip)
			aeroReady = true
			handlePress = () => {
				skipLabel.playSkip(skip)
				player.playNext()
			}
			button.addEventListener('pressend', handlePress)
		}).catch(() => {
			// AeroUI is optional. The native click handler below keeps queue navigation working offline.
		})

		return () => {
			cancelled = true
			if (handlePress) button.removeEventListener('pressend', handlePress)
		}
	})
</script>

<button
	bind:this={button}
	type="button"
	class={['aero-player', className]}
	aria-label={m.playerPlayNextTrack()}
	disabled={player.isQueueEmpty}
	onclick={() => {
		if (!aeroReady) player.playNext()
	}}
>
	<span bind:this={skip} class="aero-skip" data-direction="forward" data-size="24" aria-hidden="true"></span>
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
	}
</style>
