<script lang="ts">
	import Icon from '$lib/components/icon/Icon.svelte'
	import type { HTMLInputAttributes } from 'svelte/elements'

	let {
		checked = $bindable(false),
		disabled = false,
		icons = 'checked',
		...extra
	}: {
		checked?: boolean
		disabled?: boolean
		icons?: 'checked' | 'both' | 'none'
	} & Omit<HTMLInputAttributes, 'disabled' | 'checked'> = $props()

	let startX: number | undefined = $state()
	const handleMouseUp = (e: PointerEvent) => {
		if (!startX) return
		const distance = e.clientX - startX
		if (distance > 16 && !checked) checked = true
		if (distance < -16 && checked) checked = false
		startX = undefined
	}
</script>

<svelte:window onpointerup={handleMouseUp} />
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="m3-container"
	onpointerdown={(e) => {
		if (!disabled) {
			startX = e.clientX
		}
	}}
	ondragstart={(e) => {
		e.preventDefault()
	}}
>
	<input
		type="checkbox"
		role="switch"
		{disabled}
		bind:checked
		{...extra}
		onkeydown={(e) => {
			if (e.code === 'Enter') checked = !checked
			if (e.code === 'ArrowLeft') checked = false
			if (e.code === 'ArrowRight') checked = true
		}}
	/>
	<div class="handle">
		{#if icons !== 'none'}
			{#if icons === 'checked' || icons === 'both'}
				<Icon type="check" class="check-icon" />
			{/if}
			{#if icons === 'both'}
				<Icon type="close" class="close-icon" />
			{/if}
		{/if}
	</div>
	<div class="hover"></div>
</div>

<style lang="postcss">
	@layer tokens {
		:root {
			--m3-switch-track-shape: 9999px;
			--m3-switch-handle-shape: 9999px;
			--m3-easing: cubic-bezier(0.2, 0, 0, 1);
			--m3-easing-fast-spatial: cubic-bezier(0.3, 0, 0, 1);
			--m3-easing-fast: cubic-bezier(0.4, 0, 0.2, 1);
		}
	}
	.m3-container {
		display: inline-flex;
		position: relative;
		width: 3.25rem;
		height: 2rem;
	}
	input {
		appearance: none;
		width: 3.25rem;
		height: 2rem;
		margin: 0;
		border-radius: var(--m3-switch-track-shape);

		background-color: var(--color-surfaceContainerHighest);
		border: solid 0.125rem var(--color-outline);
		cursor: pointer;
		transition: var(--m3-easing);
	}
	.handle {
		position: absolute;
		width: 1rem;
		height: 1rem;
		border-radius: var(--m3-switch-handle-shape);

		background-color: var(--color-outline);
		color: var(--color-onPrimary);
		cursor: pointer;
		transition: var(--m3-easing-fast-spatial);

		left: 0.5rem;
		top: 50%;
		translate: 0 -50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.handle :global(svg) {
		width: 1rem;
		height: 1rem;
		opacity: 0;
		transition:
			opacity var(--m3-easing-fast-spatial),
			scale var(--m3-easing-fast-spatial);
	}
	:global(input:not(:checked) + .handle:has(:nth-child(2))) {
		scale: 1.5;
	}
	:global(input:not(:checked) + .handle:has(:nth-child(2)) svg) {
		color: var(--color-surfaceContainerHighest);
		scale: 0.667;
		opacity: 1;
	}

	input:checked + .handle :global(svg:nth-child(2)),
	input:not(:checked) + .handle :global(svg:first-child) {
		display: none;
	}

	.hover {
		position: absolute;
		width: 3rem;
		height: 3rem;
		border-radius: 9999px;

		cursor: pointer;
		transition: var(--m3-easing-fast);

		left: 1rem;
		top: 50%;
		translate: -50% -50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.m3-container:hover > input:not(:checked):not(:disabled) + .handle,
	.m3-container:active > input:not(:checked):not(:disabled) + .handle {
		background-color: var(--color-onSurfaceVariant);
	}
	.m3-container:hover > input:enabled:checked + .handle,
	.m3-container > input:enabled:checked:is(:active, :focus-visible) + .handle {
		background-color: var(--color-primaryContainer);
		color: var(--color-onPrimaryContainer);
	}
	.m3-container:hover > input ~ .hover {
		background-color: color-mix(in srgb, var(--color-onSurface) 8%, transparent);
	}
	.m3-container:hover > input:checked ~ .hover {
		background-color: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	input:checked {
		background-color: var(--color-primary);
		border-color: var(--color-primary);
	}
	input:checked + .handle {
		background-color: var(--color-onPrimary);
		scale: 1.5;
		left: 1.75rem;
	}
	input:checked + .handle :global(svg) {
		scale: 0.667;
		opacity: 1;
	}
	input:checked ~ .hover {
		left: 2.25rem;
	}
	.m3-container:active > input:enabled + .handle {
		scale: 1.75;
	}
	.m3-container:active > input:enabled + .handle :global(svg) {
		scale: 0.571;
	}

	input:disabled {
		background-color: color-mix(in srgb, var(--color-surfaceContainerHighest) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-outline) 12%, transparent);
		cursor: auto;
	}
	input:disabled:checked {
		background-color: color-mix(in srgb, var(--color-onSurface) 12%, transparent);
		border-color: transparent;
	}
	input:disabled + .handle {
		background-color: color-mix(in srgb, var(--color-onSurface) 38%, transparent);
		cursor: auto;
	}
	input:disabled:checked + .handle {
		background-color: var(--color-surface);
	}
	input:disabled:checked + .handle :global(svg) {
		color: color-mix(in srgb, var(--color-onSurface) 38%, transparent);
	}
	input:disabled ~ .hover {
		display: none;
	}

	.m3-container {
		print-color-adjust: exact;
	}
	@media screen and (forced-colors: active) {
		input:checked {
			background-color: canvastext !important;
		}
		.handle {
			background-color: canvastext !important;
		}
		input:checked + .handle {
			background-color: canvas !important;
		}
		input:disabled,
		input:disabled + .handle {
			opacity: 0.38;
		}
	}
</style>
