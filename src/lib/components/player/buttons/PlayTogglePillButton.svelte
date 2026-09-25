<script lang="ts">
	import { onMount } from 'svelte'

	const player = usePlayer()
	let button: HTMLButtonElement

	const isTypingTarget = (target: EventTarget | null) => {
		if (!(target instanceof HTMLElement)) return false
		return (
			target.isContentEditable ||
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement
		)
	}

	onMount(async () => {
		const { initPlayerButton, setPlayerIcon } = await import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'
		)

		initPlayerButton(button)
		setPlayerIcon(button, player.playing ? 'pause' : 'play')

		const handlePressEnd = () => {
			player.togglePlay()
			queueMicrotask(() => {
				setPlayerIcon(button, player.playing ? 'pause' : 'play')
			})
		}

		button.addEventListener('pressend', handlePressEnd)

		// Keep Space as the music-player shortcut even when the AeroUI button
		// itself does not have focus. Do not hijack text fields or editable UI.
		const handleGlobalKeydown = (event: KeyboardEvent) => {
			if (event.key !== ' ' || event.repeat || player.isQueueEmpty || isTypingTarget(event.target)) {
				return
			}

			if (event.target === button) {
				// AeroUI's native keydown/keyup gesture will emit pressend.
				return
			}

			event.preventDefault()
			player.togglePlay()
		}

		window.addEventListener('keydown', handleGlobalKeydown)

		return () => {
			button.removeEventListener('pressend', handlePressEnd)
			window.removeEventListener('keydown', handleGlobalKeydown)
		}
	})

	$effect(() => {
		if (!button) return
		void import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'
		).then(({ setPlayerIcon }) => {
			setPlayerIcon(button, player.playing ? 'pause' : 'play')
		})
	})
</script>

<button
	bind:this={button}
	class="aero-player"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
></button>

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
	}
</style>
