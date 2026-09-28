<script lang="ts">
	import { formatDuration } from '$lib/helpers/utils/format-duration.ts'
	import Slider from '../Slider.svelte'

	const { class: className }: { class?: ClassValue } = $props()

	const player = usePlayer()

	const max = $derived(Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0)
	const step = 0.01

	let seeking = $state(false)
	let seekingValue = $state(0)

	const value = $derived(Number.isFinite(player.currentTime) ? player.currentTime : 0)

	const getTime = (time: number) => time

	const playerSeek = (val: number) => {
		player.seek(getTime(val))
	}

	const currentTime = () => formatDuration(seeking ? getTime(seekingValue) : player.currentTime)

	const getSliderValue = () => (seeking ? seekingValue : value)
	const setSliderValue = (val: number) => {
		if (seeking) {
			seekingValue = val
		} else {
			playerSeek(val)
		}
	}
</script>

<div
	class={[
		'timeline-container grid w-full items-center gap-2.5 text-nowrap tabular-nums',
		className,
	]}
>
	<div class="text-body-sm">
		{currentTime()}
	</div>

	<Slider
		disabled={!player.activeTrack}
		{max}
		step={step}
		bind:value={getSliderValue, setSliderValue}
		onSeekStart={() => {
			if (!seeking) {
				seekingValue = value
			}

			seeking = true
		}}
		onSeekEnd={() => {
			seeking = false

			playerSeek(seekingValue)
		}}
	/>

	<div class="text-right text-body-sm">
		{formatDuration(player.duration)}
	</div>
</div>

<style>
	.timeline-container {
		grid-template-columns: minmax(32px, max-content) 1fr minmax(32px, max-content);
	}
</style>
