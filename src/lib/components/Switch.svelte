<script lang="ts">
	import { Switch as M3Switch } from 'm3-svelte'

	interface Props {
		checked: boolean
	}

	let { checked = $bindable(false) }: Props = $props()
</script>

<label class="interactable inline-flex">
	<M3Switch bind:checked icons="both" />
</label>
