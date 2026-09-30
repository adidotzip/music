<script lang="ts">
	import { formatArtists, getItemLanguage } from '$lib/helpers/utils/text.ts'
	import Button from './Button.svelte'
	import Icon from './icon/Icon.svelte'
	import PlayerFavoriteButton from './player/buttons/PlayerFavoriteButton.svelte'
	import PlayNextButton from './player/buttons/PlayNextButton.svelte'
	import PlayPrevButton from './player/buttons/PlayPrevButton.svelte'
	import PlayToggleButton from './player/buttons/PlayToggleButton.svelte'
	import MainControls from './player/MainControls.svelte'
	import PlayerArtwork from './player/PlayerArtwork.svelte'
	import Timeline from './player/Timeline.svelte'
	import VolumeSlider from './player/VolumeSlider.svelte'

	const { class: className }: { class?: ClassValue } = $props()

	const mainStore = useMainStore()
	const player = usePlayer()

	const track = $derived(player.activeTrack)
</script>

<div
	id="mini-player"
	class={[
		'mini-player-shell pointer-events-auto mx-auto block w-full max-w-[56.25rem] justify-self-center overflow-hidden rounded-2xl border border-primary/10 bg-secondaryContainer text-onSecondaryContainer contain-content view-name-[pl-card] sm:rounded-3xl active-view-player:border-transparent',
		className,
	]}
>
	<div class="flex size-full min-w-0 flex-col items-center justify-between gap-4 px-2 py-2 sm:px-4 sm:pt-2 sm:pb-4">
		<Timeline class="max-sm:hidden" />

		<div class="grid h-min w-full min-w-0 grid-cols-[minmax(0,1fr)_max-content_1fr] items-center gap-2">
			<div class="flex w-full min-w-0 items-center justify-self-start">
				<Button
					as="a"
					href="/player"
					kind="blank"
					tooltip={m.playerOpenFullPlayer()}
					class="group flex min-w-0 flex-1 shrink items-center overflow-hidden rounded-lg pr-2 max-sm:p-2 sm:h-11"
				>
					<div class="relative size-11 shrink-0 overflow-hidden rounded-lg bg-onSecondary active-view-player:view-name-[pl-artwork]">
						{#if track}
							<PlayerArtwork class="size-full" />
					{:else}
							<Icon type="musicNote" class="absolute inset-0 m-auto size-5 text-onSecondaryContainer/40" />
						{/if}
						<Icon
							type="chevronUp"
							class={[
								'absolute inset-0 m-auto shrink-0 active-view-player:view-name-[pl-chevron-up]',
								track && 'scale-0 rounded-full bg-tertiary text-onTertiary transition-[transform,opacity] duration-200 [.group:hover_&]:scale-100',
							]}
						/>
					</div>

					{#if track}
						<div class="mr-1 ml-4 grid min-w-0 flex-1 overflow-hidden text-left" lang={getItemLanguage(track.language)}>
							<div class="min-w-0 max-w-full truncate text-body-sm sm:text-body-md">{track.name}</div>
							<div class="min-w-0 max-w-full truncate text-body-sm">{formatArtists(track.artists)}</div>
						</div>
					{:else}
						<div class="ml-4 min-w-0 truncate text-body-sm text-onSecondaryContainer/60">{m.playerQueueEmpty()}</div>
					{/if}
				</Button>

				<PlayerFavoriteButton class="shrink-0" />
			</div>

			<div class="ml-auto flex shrink-0 gap-2 pr-2 sm:hidden">
				<PlayToggleButton />
				<PlayNextButton class="max-xss:hidden" />
			</div>

			<MainControls class="max-sm:hidden" />

			<div class="ml-auto flex min-w-0 items-center justify-end gap-2 pr-2 max-sm:hidden">
				{#if mainStore.volumeSliderEnabled}
					<VolumeSlider />
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	@reference '../../app.css';

	.mini-player-shell {
		width: calc(100% - 1rem) !important;
		max-width: 56.25rem !important;
		margin-inline: auto !important;
		justify-self: center !important;
	}

	/* Keep long titles from becoming intrinsic grid widths and causing the overlay to jump. */
	:global(#mini-player .m3-button-base) {
		min-width: 0;
		max-width: 100%;
		flex-shrink: 1;
	}

	:global(#mini-player .m3-button-base .button-content) {
		min-width: 0;
		max-width: 100%;
		width: 100%;
		flex-shrink: 1;
		overflow: hidden;
	}

	:global(#mini-player .m3-button-base .button-content > div) {
		min-width: 0;
		max-width: 100%;
	}

	@media (max-width: 639px) {
		.mini-player-shell {
			width: calc(100% - 0.5rem) !important;
			border-radius: 24px;
		}

		:global(#mini-player .aero-player) {
			--player-size: clamp(36px, 10vw, 40px);
			--player-icon: clamp(22px, 6vw, 24px);
		}

		:global(#mini-player .mobile-player-control) {
			width: clamp(32px, 9vw, 38px);
			height: clamp(32px, 9vw, 38px);
			flex: 0 0 clamp(32px, 9vw, 38px);
		}

		:global(#mini-player .mobile-player-control .aero-skip) {
			--skip-size: clamp(20px, 6vw, 22px);
		}
	}

	@media (max-width: 320px) {
		.mini-player-shell {
			width: calc(100% - 0.5rem) !important;
		}

		:global(#mini-player .group > div:first-child) {
			width: 32px;
			height: 32px;
			flex-basis: 32px;
		}

		:global(#mini-player .group > div:nth-child(2)) {
			margin-left: 8px;
		}
	}

	::view-transition-old(pl-chevron-up) {
		display: none;
	}

	@keyframes -global-view-pl-chevron-up-fade-in {
		from {
			opacity: 0;
			transform: scale(0);
		}
	}

	::view-transition-new(pl-chevron-up) {
		animation: view-pl-chevron-up-fade-in 125ms 225ms linear backwards;
	}
</style>
