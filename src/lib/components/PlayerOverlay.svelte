<script lang="ts">
    import type { ClassValue } from 'clsx'
    import { formatArtists, getItemLanguage } from '$lib/helpers/utils/text'
    import { useMainStore } from '$lib/stores/main'
    import { usePlayer } from '$lib/stores/player'

    import Button from './Button.svelte'
    import Icon from './icon/Icon.svelte'
    import MainControls from './player/MainControls.svelte'
    import PlayerArtwork from './player/PlayerArtwork.svelte'
    import PlayerFavoriteButton from './player/buttons/PlayerFavoriteButton.svelte'
    import PlayNextButton from './player/buttons/PlayNextButton.svelte'
    import PlayToggleButton from './player/buttons/PlayToggleButton.svelte'
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
        'pointer-events-auto mx-auto w-full max-w-225 overflow-hidden rounded-2xl border border-primary/10 bg-secondaryContainer text-onSecondaryContainer contain-content view-name-[pl-card] sm:rounded-3xl active-view-player:border-transparent',
        className,
    ]}
>
    <div class="flex size-full flex-col items-center justify-between gap-1 sm:gap-2 sm:px-4 sm:pt-2 sm:pb-3">
        <!-- Desktop Timeline -->
        <Timeline class="w-full max-sm:hidden" />

        <!-- Player Main Row -->
        <div class="flex h-16 w-full min-w-0 items-center justify-between gap-2 px-2 py-1 sm:grid sm:h-12 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-0 sm:py-0">
            
            <!-- Left: Track Info & Link -->
            <div class="flex min-w-0 items-center gap-2 overflow-hidden">
                <Button
                    as="a"
                    href="/player"
                    kind="blank"
                    aria-label={track ? `Open full player for ${track.name}` : 'Open full player'}
                    tooltip={m.playerOpenFullPlayer()}
                    class="group flex min-w-0 flex-1 items-center justify-start overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-primary sm:rounded-lg"
                >
                    <div class="relative size-11 shrink-0 overflow-hidden rounded-lg bg-onSecondary active-view-player:view-name-[pl-artwork]">
                        {#if track}
                            <PlayerArtwork class="size-full object-cover" />
                        {/if}

                        <Icon
                            type="chevronUp"
                            class={[
                                'absolute inset-0 m-auto shrink-0 active-view-player:view-name-[pl-chevron-up]',
                                track &&
                                    'scale-0 rounded-full bg-tertiary text-onTertiary transition-transform duration-200 group-hover:scale-100 group-active:scale-100',
                            ]}
                        />
                    </div>

                    {#if track}
                        <div 
                            class="ml-3 min-w-0 flex-1 overflow-hidden text-left" 
                            lang={getItemLanguage(track.language)}
                        >
                            <div class="truncate text-body-md font-medium leading-tight">
                                {track.name}
                            </div>
                            <div class="truncate text-body-sm opacity-80 leading-tight">
                                {formatArtists(track.artists)}
                            </div>
                        </div>
                    {/if}
                </Button>

                <!-- Favorite Button outside Link target -->
                <div class="flex size-11 shrink-0 items-center justify-center">
                    <PlayerFavoriteButton class="size-10" />
                </div>
            </div>

            <!-- Center Controls: Mobile Simple / Desktop Full -->
            <div class="flex shrink-0 items-center gap-1 sm:hidden">
                <PlayToggleButton />
                <PlayNextButton class="max-xss:hidden" />
            </div>

            <div class="flex items-center justify-center max-sm:hidden">
                <MainControls />
            </div>

            <!-- Right Controls: Desktop Volume -->
            <div class="flex min-w-0 items-center justify-end gap-1 max-sm:hidden">
                {#if mainStore.volumeSliderEnabled}
                    <VolumeSlider />
                {/if}
            </div>

        </div>
    </div>
</div>

<style lang="postcss">
  @reference '../../app.css';

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
    animation: -global-view-pl-chevron-up-fade-in 125ms 225ms linear backwards;
  }
</style>
