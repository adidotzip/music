<script lang="ts">
	import { onMount } from 'svelte'

	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()

	let button: HTMLButtonElement
	let skip: HTMLSpanElement

	onMount(async () => {
		const [{ initPlayerButton }, { initSkipLabel, playSkip }] = await Promise.all([
			import('https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'),
			import('https://nurislamaibekuly.github.io/aeroui/src/components/skip-label/skip-label.js')
		])

		initPlayerButton(button)
		initSkipLabel(skip)

		button.addEventListener('pressend', () => {
			playSkip(skip, { bouncing: true })
			player.playNext()
		})
	})
</script>

<button
	bind:this={button}
	class={['aero-player', className]}
	aria-label={m.playerPlayNextTrack()}
	disabled={player.isQueueEmpty}
>
	<span bind:this={skip} class="aero-skip" data-direction="forward" aria-hidden="true"></span>
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player {
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 55%, transparent);
	}
</style>
