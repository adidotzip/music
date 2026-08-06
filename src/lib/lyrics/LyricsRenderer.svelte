<script lang="ts">
	import { browser } from '$app/environment'
	import '@braccato/core/styles/variables.css'
	import '@braccato/core/styles/lyrics.css'
	import '@braccato/core/styles/instrumental.css'
	import type { Lyric } from '@braccato/parsers'

	interface Props {
		lyrics: Lyric[] | null
		source: HTMLAudioElement | string | null
	}

	let { lyrics, source }: Props = $props()

	let el:
		| (HTMLElement & {
				lyrics: Lyric[] | null
				source: HTMLAudioElement | string | null
		  })
		| undefined

	if (browser) {
		void import('@braccato/core/element')
	}

	$effect(() => {
		if (!el) return

		el.lyrics = lyrics
		el.source = source
	})
</script>

<braccato-lyrics bind:this={el} />
