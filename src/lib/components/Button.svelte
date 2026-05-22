<script module lang="ts">
	import { ripple } from '../attachments/ripple.ts'
	import { tooltip } from '../attachments/tooltip.ts'

	export type AllowedButtonElement = 'button' | 'a'
	export type ButtonKind = 'filled' | 'toned' | 'outlined' | 'flat' | 'elevated' | 'blank'
	export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'
	export type ButtonHref<As extends AllowedButtonElement> = As extends 'a' ? string : never

	export interface ButtonProps<As extends AllowedButtonElement> {
		as?: As
		kind?: ButtonKind
		size?: ButtonSize
		type?: 'button' | 'submit' | 'reset'
		target?: string
		disabled?: boolean
		href?: ButtonHref<As>
		class?: string
		tabindex?: number
		ariaLabel?: string
		tooltip?: string
		children?: import('svelte').Snippet
		onclick?: (event: MouseEvent) => void
	}
</script>

<script lang="ts" generics="As extends AllowedButtonElement = 'button'">
	let {
		as = 'button' as As,
		kind = 'filled',
		size = 'md',
		disabled = false,
		href = (as === 'a' ? '' : undefined) as ButtonHref<As>,
		type = 'button',
		children,
		ariaLabel,
		tooltip: tooltipMessage,
		...restProps
	}: ButtonProps<As> = $props()

	const KIND_CLASS_MAP = {
		filled: 'filled-button',
		toned: 'tonal-button',
		outlined: 'outlined-button',
		flat: 'flat-button',
		elevated: 'elevated-button',
		blank: '',
	} as const

	const SIZE_CLASS_MAP = {
		sm: 'h-8 px-4 text-sm',
		md: 'h-10 px-6 text-base',
		lg: 'h-12 px-8 text-lg',
		xl: 'h-14 px-10 text-xl',
	} as const
</script>

<svelte:element
	this={(disabled ? 'button' : as) as any}
	{@attach ripple({ stopPropagation: true })}
	{@attach tooltip(tooltipMessage)}
	{...restProps}
	{type}
	aria-label={ariaLabel}
	{href}
	disabled={disabled || undefined}
	class={[
		'm3-button-base',
		KIND_CLASS_MAP[kind],
		kind !== 'blank' && SIZE_CLASS_MAP[size],
		restProps.class,
	]}
>
	{#if children}
		<div class="button-content">
			{@render children()}
		</div>
	{/if}
</svelte:element>

<style lang="postcss">
	/* Use M3 Easing (Fast Spatial) for that organic feel */
	:root {
		--m3-easing-standard: cubic-bezier(0.2, 0, 0, 1);
		--m3-easing-emphasized: cubic-bezier(0.3, 0, 0, 1);
	}

	.m3-button-base {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border-radius: 9999px; 
		border: none;
		cursor: pointer;
		overflow: hidden;
		user-select: none;
		transition: 
			background-color 200ms var(--m3-easing-standard),
			color 200ms var(--m3-easing-standard),
			box-shadow 200ms var(--m3-easing-standard),
			border-radius 400ms var(--m3-easing-emphasized),
			transform 200ms var(--m3-easing-emphasized);
		
		
		font-weight: 500;
		letter-spacing: 0.1px;
	}

	
	.m3-button-base:active:not(:disabled) {
		
		border-radius: 12px;
		transform: scale(0.97);
	}

	.button-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: inherit;
		z-index: 1;
	}

	
	.filled-button {
		background-color: var(--color-primary);
		color: var(--color-onPrimary);
	}

	.tonal-button {
		background-color: var(--color-secondaryContainer);
		color: var(--color-onSecondaryContainer);
	}

	.outlined-button {
		background-color: transparent;
		color: var(--color-primary);
		border: 1px solid var(--color-outline);
	}

	.elevated-button {
		background-color: var(--color-surfaceContainerLow);
		color: var(--color-primary);
		box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1);
	}
	
	.elevated-button:hover:not(:disabled) {
		box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
	}

	/* Disabled state logic consistent with the Switch example */
	.m3-button-base:disabled {
		cursor: default;
		pointer-events: none;
		background-color: color-mix(in srgb, var(--color-onSurface) 12%, transparent);
		color: color-mix(in srgb, var(--color-onSurface) 38%, transparent);
		box-shadow: none;
		transform: none;
		border-radius: 9999px; /* Reset shape */
	}

	
	.m3-button-base:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
