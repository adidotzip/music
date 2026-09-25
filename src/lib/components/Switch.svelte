<script lang="ts">
	import Icon from './icon/Icon.svelte'

	interface Props {
		checked: boolean
	}

	let { checked = $bindable(false) }: Props = $props()

	const toggle = () => {
		checked = !checked
	}
</script>

<button
	type="button"
	class={[
		'interactable relative flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-4xl border-2 outline-offset-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary',
		checked ? 'border-transparent bg-primary' : 'border-outline bg-surfaceContainerHigh',
	]}
	role="switch"
	aria-checked={checked}
	onclick={toggle}
>
	<span
		class={[
			'absolute flex items-center justify-center rounded-full transition-all duration-200',
			checked
				? 'left-6 h-6 w-6 bg-onPrimary text-primary'
				: 'left-1.5 h-4 w-4 bg-outline text-surfaceContainerHigh',
		]}
		aria-hidden="true"
	>
		<Icon type={checked ? 'check' : 'close'} class={checked ? 'size-4' : 'size-3'} />
	</span>
</button>
