<script lang="ts">
    import { Kawarp } from '@kawarp/core'
    import { onMount } from 'svelte'

    interface Props {
        imageUrl: string | null
        enabled?: boolean
        warpIntensity?: number
        blurPasses?: number
        animationSpeed?: number
        transitionDuration?: number
        saturation?: number
        tintColor?: [number, number, number]
        tintIntensity?: number
        dithering?: number
        scale?: number
    }

    const {
        imageUrl,
        enabled = true,
        warpIntensity = 0.8,
        blurPasses = 8,
        animationSpeed = 1,
        transitionDuration = 1000,
        saturation = 1.5,
        tintColor,
        tintIntensity = 0.15,
        dithering = 0.008,
        scale = 1
    }: Props = $props()

    const mainStore = useMainStore()
    const player = usePlayer()

    // 1. Desktop Check: Skip initialization on Mobile/iOS/Android to preserve background playback
    let isDesktop = $state(false)

    const activeTintColor = $derived<[number, number, number]>(
        tintColor === undefined
            ? (mainStore.isThemeDark ? [0.16, 0.16, 0.24] : [0.95, 0.95, 0.98])
            : tintColor
    )

    const isReducedMotion = $derived(mainStore.isReducedMotion)
    const activeAnimationSpeed = $derived(isReducedMotion ? 0 : animationSpeed)

    let canvasElement = $state<HTMLCanvasElement>()
    let kawarpInstance: Kawarp | null = null
    let currentLoadedUrl: string | null = null
    let isLoaded = $state(false)
    let animationFrameId: number | null = null

    // Beat Detection state trackers
    let bassEnergy = 0
    let beatCutoff = 0
    let beatDecay = 0.98 // Decay rate for peak threshold

    const runAudioReaction = () => {
        if (!enabled || !kawarpInstance || !isDesktop) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
            return
        }

        const analyser = player.equalizer.analyser
        if (analyser && player.playing) {
            const bufferLength = analyser.frequencyBinCount
            const dataArray = new Uint8Array(bufferLength)
            analyser.getByteFrequencyData(dataArray)

            // 2. Focused Bass Spectrum (20Hz - 150Hz range instead of first 15%)
            const sampleRate = analyser.context.sampleRate || 44100
            const nyquist = sampleRate / 2
            const binHz = nyquist / bufferLength
            
            const lowBin = Math.floor(20 / binHz)
            const highBin = Math.min(bufferLength, Math.ceil(150 / binHz))
            
            let bassSum = 0
            const count = Math.max(1, highBin - lowBin)
            for (let i = lowBin; i < highBin; i++) {
                bassSum += dataArray[i] ?? 0
            }
            
            const rawBass = bassSum / count / 255 // Normalized 0-1

            // Dynamic peak-threshold beat detection algorithm
            if (rawBass > beatCutoff && rawBass > 0.3) {
                bassEnergy = rawBass // Trigger beat punch instantly
                beatCutoff = rawBass * 1.15 // Elevate threshold above current hit
            } else {
                bassEnergy *= 0.88 // Fast drop for snappy decay on beats
                beatCutoff *= beatDecay // Gradually drop threshold over time
            }

            // Smooth updates targeting beat punch
            const targetWarpIntensity = warpIntensity + bassEnergy * 0.9
            const targetAnimationSpeed = activeAnimationSpeed + bassEnergy * 2.0
            const targetScale = scale + bassEnergy * 0.08

            // Immediate reaction on attack, smooth on fall
            const ease = bassEnergy > 0.4 ? 0.4 : 0.12
            
            kawarpInstance.warpIntensity += (targetWarpIntensity - kawarpInstance.warpIntensity) * ease
            kawarpInstance.animationSpeed += (targetAnimationSpeed - kawarpInstance.animationSpeed) * ease
            kawarpInstance.scale += (targetScale - kawarpInstance.scale) * ease
        } else {
            // Smoothly ease back to standard state when paused
            kawarpInstance.warpIntensity += (warpIntensity - kawarpInstance.warpIntensity) * 0.05
            kawarpInstance.animationSpeed += (activeAnimationSpeed - kawarpInstance.animationSpeed) * 0.05
            kawarpInstance.scale += (scale - kawarpInstance.scale) * 0.05
        }

        animationFrameId = requestAnimationFrame(runAudioReaction)
    }

    onMount(() => {
        // Detect desktop platforms (Excludes iOS & Android user agents)
        const ua = navigator.userAgent
        isDesktop = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)

        if (!isDesktop) return

        let resizeObserver: ResizeObserver | null = null

        if (canvasElement) {
            try {
                kawarpInstance = new Kawarp(canvasElement, {
                    warpIntensity,
                    blurPasses,
                    animationSpeed: activeAnimationSpeed,
                    transitionDuration,
                    saturation,
                    tintColor: activeTintColor,
                    tintIntensity,
                    dithering,
                    scale
                })

                resizeObserver = new ResizeObserver(() => {
                    kawarpInstance?.resize()
                })
                resizeObserver.observe(canvasElement)

                if (enabled && imageUrl) {
                    currentLoadedUrl = imageUrl
                    kawarpInstance.loadImage(imageUrl)
                        .then(() => {
                            isLoaded = true
                            if (kawarpInstance && enabled) kawarpInstance.start()
                        })
                        .catch((err) => {
                            console.error('Failed to load initial Kawarp image:', err)
                            isLoaded = false
                        })
                } else if (enabled) {
                    kawarpInstance.start()
                }
            } catch (e) {
                console.error('Failed to initialize Kawarp:', e)
            }
        }

        return () => {
            resizeObserver?.disconnect()
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
            if (kawarpInstance) {
                kawarpInstance.stop()
                kawarpInstance.dispose()
                kawarpInstance = null
            }
        }
    })

    // React to options changes
    $effect(() => {
        if (!kawarpInstance || !isDesktop) return

        kawarpInstance.setOptions({
            warpIntensity,
            blurPasses,
            animationSpeed: activeAnimationSpeed,
            transitionDuration,
            saturation,
            tintColor: activeTintColor,
            tintIntensity,
            dithering,
            scale
        })
    })

    // React to audio playing and start/stop visualizer loop
    $effect(() => {
        if (player.playing && enabled && kawarpInstance && isDesktop) {
            if (!animationFrameId) {
                runAudioReaction()
            }
        } else {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
        }

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
        }
    })

    // React to imageUrl changes
    $effect(() => {
        if (!kawarpInstance || !isDesktop) return

        if (!imageUrl) {
            isLoaded = false
            currentLoadedUrl = null
            return
        }

        if (imageUrl !== currentLoadedUrl) {
            currentLoadedUrl = imageUrl
            kawarpInstance.loadImage(imageUrl)
                .then(() => {
                    isLoaded = true
                    if (kawarpInstance && enabled) kawarpInstance.start()
                })
                .catch((err) => {
                    console.error('Failed to load Kawarp image:', err)
                    isLoaded = false
                })
        }
    })

    // React to enabled changes
    $effect(() => {
        if (!kawarpInstance || !isDesktop) return

        if (enabled && isLoaded) {
            kawarpInstance.start()
        } else {
            kawarpInstance.stop()
        }
    })
</script>

{#if isDesktop}
    <div
        class="kawarp-background"
        style="opacity: {isLoaded && enabled ? 1 : 0};"
    >
        <canvas bind:this={canvasElement}></canvas>
        <div class="kawarp-overlay"></div>
    </div>
{/if}

<style lang="postcss">
    @reference '../../app.css';

    .kawarp-background {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: none;
        z-index: 0;
        transition: opacity 0.5s ease;
    }

    .kawarp-background canvas {
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    .kawarp-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 1;
        transition: background 0.5s ease;
    }

    :global(.dark) .kawarp-overlay {
        background: linear-gradient(
            to bottom,
            rgb(0 0 0 / 0.12),
            rgb(0 0 0 / 0.35)
        );
    }

    :global(html:not(.dark)) .kawarp-overlay {
        background: linear-gradient(
            to bottom,
            rgb(255 255 255 / 0.45),
            rgb(255 255 255 / 0.7)
        );
    }
</style>
