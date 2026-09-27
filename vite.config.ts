import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import { imageMetadataPlugin } from './lib/vite-image-metadata.ts'
import { logChunkSizePlugin } from './lib/vite-log-chunk-size.ts'

const getAutoImportPlugin = (dts: string | false = false) =>
	AutoImport({
		dts,
		imports: [
			{
				'$paraglide/messages': [['*', 'm']],
				'$lib/stores/player/use-store.ts': ['usePlayer'],
				'$lib/stores/main/use-store.ts': ['useMainStore'],
				'$lib/stores/dialogs/use-store.ts': ['useDialogsStore'],
				'$lib/components/menu/MenuRenderer.svelte': ['useMenu'],
				'$lib/components/snackbar/snackbar.ts': ['snackbar'],
				'tiny-invariant': [['default', 'invariant']],
				svelte: ['untrack'],
			},
		],
	})

const tauriDevHost = process.env.TAURI_DEV_HOST

export default defineConfig({
	clearScreen: false,
	server: {
		host: tauriDevHost || false,
		port: 5173,
		strictPort: true,
		fs: {
			allow: ['./.generated'],
		},
		warmup: {
			clientFiles: [
				'src/lib/components/**/*.svelte',
				'src/lib/library/scan-actions/scanner/worker.ts',
			],
		},
		hmr: tauriDevHost
			? {
					protocol: 'ws',
					host: tauriDevHost,
					port: 1421,
				}
			: undefined,
	},
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	build: {
		target: ['chrome130', 'safari18'],
		rolldownOptions: {
			output: {
				comments: false,
				advancedChunks: {
					groups: [
						{
							name: 'styles',
							test: /\.css$/,
							minModuleSize: 0,
							priority: 100,
						},
						{
							name: 'small-chunks',
							maxModuleSize: 1 * 1024,
						},
					],
				},
			},
		},
	},
	worker: {
		format: 'es',
		plugins: () => [getAutoImportPlugin()],
	},
	plugins: [
		imageMetadataPlugin(),
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './.generated/paraglide',
			strategy: ['baseLocale'],
			isServer: 'import.meta.env.SSR',
		}),
		getAutoImportPlugin('./.generated/types/auto-imports.d.ts'),
		logChunkSizePlugin(),
		{
			name: 'ssr-config',
			config(config) {
				const isSsr = config?.build?.ssr
				config.logLevel = isSsr ? 'warn' : 'info'
				return config
			},
		},
	],
})
