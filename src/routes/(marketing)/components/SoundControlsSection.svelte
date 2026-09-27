<script lang="ts">
	import soundMixerImg from '../assets/sound-mixer.png'
	import Section from './Section.svelte'
</script>

<Section
	class="mktg-content-width"
	label="Sound controls"
	labelColor="tertiary"
	title="Adjust the sound, set your pace"
>
	<div class="grid gap-6 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.24fr)] lg:items-center">
		<div class="marketing-scroll-enter-soft flex flex-col justify-center gap-8 py-2 max-sm:gap-6">
			<div class="max-w-xl">
				<div class="mb-2 text-label-md text-tertiary">Built-in equalizer</div>
				<h3 class="text-title-lg font-semibold text-onSurface">
					Tune the equalizer for your headphones or speakers
				</h3>
				<p class="mt-2 text-body-lg leading-relaxed text-onSurfaceVariant">
					Start with a preset, then fine-tune each band until the sound is right.
				</p>
			</div>

			<div class="max-w-xl">
				<div class="mb-2 text-label-md text-secondary">Playback speed</div>
				<h3 class="text-title-lg font-semibold text-onSurface">Listen at any speed</h3>
				<p class="mt-2 text-body-lg leading-relaxed text-onSurfaceVariant">
					Slow down for closer listening or move through albums and long mixes at your own pace.
				</p>
			</div>
		</div>

		<div class="equalizer-stage marketing-scroll-enter-soft relative">
			<div class="relative overflow-hidden rounded-[1.9rem] border border-outlineVariant bg-surfaceContainerLow p-2 shadow-xl">
				<img
					src={soundMixerImg}
					alt="Adi Music sound controls and audio mixer"
					class="block h-auto w-full rounded-[1.4rem] object-cover"
					loading="lazy"
				/>
			</div>
		</div>
	</div>
</Section>
