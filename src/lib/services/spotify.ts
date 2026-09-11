import { setLibraryValueInCache } from '$lib/library/get/value.ts'
import type { AlbumData, ArtistData, PlaylistData, TrackData } from '$lib/library/get/value-queries.ts'
import type { MusicProvider, MusicProviderSearchResult } from './music-provider.ts'

export interface SpotifyUserProfile {
	id: string
	display_name: string
	email?: string
	product: 'premium' | 'free' | string
	images?: { url: string }[]
}

export interface SpotifyTokens {
	accessToken: string
	refreshToken: string
	expiresAt: number
}

const STORAGE_TOKENS_KEY = 'spotify_tokens'
const STORAGE_PROFILE_KEY = 'spotify_profile'
const STORAGE_VERIFIER_KEY = 'spotify_code_verifier'
const STORAGE_STATE_KEY = 'spotify_auth_state'
const STORAGE_REDIRECT_URI_KEY = 'spotify_redirect_uri'

// Map of Spotify ID or track numeric ID to TrackData in memory
const spotifyTrackRegistry = new Map<number, TrackData>()

export function stringToNegativeId(str: string): number {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i)
		hash |= 0
	}
	return -Math.abs(hash || 1)
}

export function getSpotifyTrackById(id: number): TrackData | undefined {
	return spotifyTrackRegistry.get(id)
}

export function registerSpotifyTrack(track: TrackData): void {
	spotifyTrackRegistry.set(track.id, track)
	setLibraryValueInCache('tracks', track.id, track)
}

// PKCE Helper Functions
function generateRandomString(length: number): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	const values = crypto.getRandomValues(new Uint8Array(length))
	return values.reduce((acc, x) => acc + possible[x % possible.length], '')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
	const encoder = new TextEncoder()
	const data = encoder.encode(plain)
	return crypto.subtle.digest('SHA-256', data)
}

function base64urlencode(a: ArrayBuffer): string {
	return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(a))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

export class SpotifyService implements MusicProvider {
	readonly id = 'spotify'
	readonly name = 'Spotify'

	#tokens: SpotifyTokens | null = null
	#profile: SpotifyUserProfile | null = null
	#refreshPromise: Promise<string | null> | null = null

	#player: any = null
	deviceId: string | null = null
	#isSdkLoading = false

	onPlaybackStateChange: ((state: { paused: boolean; position: number; duration: number }) => void) | null = null
	onTrackEnded: (() => void) | null = null

	constructor() {
		if (typeof window !== 'undefined') {
			this.#loadStoredState()
		}
	}

	#loadStoredState(): void {
		try {
			const tokensJson = localStorage.getItem(STORAGE_TOKENS_KEY)
			if (tokensJson) {
				this.#tokens = JSON.parse(tokensJson)
			}
			const profileJson = localStorage.getItem(STORAGE_PROFILE_KEY)
			if (profileJson) {
				this.#profile = JSON.parse(profileJson)
			}
		} catch (err) {
			console.error('Failed to load Spotify stored state:', err)
		}
	}

	get clientId(): string {
		return (
			import.meta.env.PUBLIC_SPOTIFY_CLIENT_ID ||
			(typeof window !== 'undefined' ? (window as any).PUBLIC_SPOTIFY_CLIENT_ID : '') ||
			''
		)
	}

	get isConnected(): boolean {
		return !!this.#tokens?.accessToken && !!this.#profile
	}

	get isPremium(): boolean {
		return this.#profile?.product === 'premium'
	}

	get userProfile(): SpotifyUserProfile | null {
		return this.#profile
	}

	get defaultRedirectUri(): string {
		if (typeof window === 'undefined') return ''
		return (
			import.meta.env.PUBLIC_SPOTIFY_REDIRECT_URI ||
			`${window.location.origin}/settings`
		)
	}

	async initiateAuth(): Promise<void> {
		if (!this.clientId) {
			throw new Error('Spotify Client ID is not configured. Please set PUBLIC_SPOTIFY_CLIENT_ID in .env.')
		}

		const codeVerifier = generateRandomString(64)
		const hashed = await sha256(codeVerifier)
		const codeChallenge = base64urlencode(hashed)
		const state = generateRandomString(16)
		const redirectUri = this.defaultRedirectUri

		localStorage.setItem(STORAGE_VERIFIER_KEY, codeVerifier)
		localStorage.setItem(STORAGE_STATE_KEY, state)
		localStorage.setItem(STORAGE_REDIRECT_URI_KEY, redirectUri)

		const scope = [
			'streaming',
			'user-read-email',
			'user-read-private',
			'user-read-playback-state',
			'user-modify-playback-state',
			'user-library-read',
			'playlist-read-private',
			'playlist-read-collaborative',
			'user-read-recently-played',
		].join(' ')

		const authUrl = new URL('https://accounts.spotify.com/authorize')
		authUrl.searchParams.set('client_id', this.clientId)
		authUrl.searchParams.set('response_type', 'code')
		authUrl.searchParams.set('redirect_uri', redirectUri)
		authUrl.searchParams.set('code_challenge_method', 'S256')
		authUrl.searchParams.set('code_challenge', codeChallenge)
		authUrl.searchParams.set('scope', scope)
		authUrl.searchParams.set('state', state)

		window.location.href = authUrl.toString()
	}

	async handleAuthCallback(code: string, state: string): Promise<{ success: boolean; error?: string }> {
		const storedState = localStorage.getItem(STORAGE_STATE_KEY)
		const codeVerifier = localStorage.getItem(STORAGE_VERIFIER_KEY)
		const redirectUri = localStorage.getItem(STORAGE_REDIRECT_URI_KEY) || this.defaultRedirectUri

		localStorage.removeItem(STORAGE_STATE_KEY)
		localStorage.removeItem(STORAGE_VERIFIER_KEY)
		localStorage.removeItem(STORAGE_REDIRECT_URI_KEY)

		if (!storedState || storedState !== state) {
			return { success: false, error: 'State mismatch error during authentication.' }
		}

		if (!codeVerifier) {
			return { success: false, error: 'Missing PKCE code verifier.' }
		}

		try {
			const body = new URLSearchParams({
				client_id: this.clientId,
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
				code_verifier: codeVerifier,
			})

			const response = await fetch('https://accounts.spotify.com/api/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body,
			})

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}))
				throw new Error(errData.error_description || 'Failed to exchange authorization code for tokens.')
			}

			const data = await response.json()
			this.#tokens = {
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				expiresAt: Date.now() + data.expires_in * 1000,
			}
			localStorage.setItem(STORAGE_TOKENS_KEY, JSON.stringify(this.#tokens))

			await this.refreshProfile()

			if (!this.isPremium) {
				return {
					success: true,
					error: 'Spotify connected, but Spotify Premium is required for music playback.',
				}
			}

			void this.initPlayerSdk()

			return { success: true }
		} catch (err: any) {
			console.error('Spotify auth error:', err)
			return { success: false, error: err.message || 'Authentication failed.' }
		}
	}

	disconnect(): void {
		if (this.#player) {
			try {
				this.#player.disconnect()
			} catch (e) {
				// ignore
			}
			this.#player = null
		}
		this.deviceId = null
		this.#tokens = null
		this.#profile = null
		localStorage.removeItem(STORAGE_TOKENS_KEY)
		localStorage.removeItem(STORAGE_PROFILE_KEY)
		localStorage.removeItem(STORAGE_VERIFIER_KEY)
		localStorage.removeItem(STORAGE_STATE_KEY)
		localStorage.removeItem(STORAGE_REDIRECT_URI_KEY)
	}

	async getValidAccessToken(): Promise<string | null> {
		if (!this.#tokens) return null

		// Buffer of 60s
		if (Date.now() < this.#tokens.expiresAt - 60000) {
			return this.#tokens.accessToken
		}

		if (this.#refreshPromise) {
			return this.#refreshPromise
		}

		this.#refreshPromise = (async () => {
			try {
				if (!this.#tokens?.refreshToken) {
					this.disconnect()
					return null
				}

				const body = new URLSearchParams({
					client_id: this.clientId,
					grant_type: 'refresh_token',
					refresh_token: this.#tokens.refreshToken,
				})

				const response = await fetch('https://accounts.spotify.com/api/token', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body,
				})

				if (!response.ok) {
					this.disconnect()
					return null
				}

				const data = await response.json()
				this.#tokens = {
					accessToken: data.access_token,
					refreshToken: data.refresh_token || this.#tokens.refreshToken,
					expiresAt: Date.now() + data.expires_in * 1000,
				}
				localStorage.setItem(STORAGE_TOKENS_KEY, JSON.stringify(this.#tokens))
				return this.#tokens.accessToken
			} catch (err) {
				console.error('Error refreshing Spotify token:', err)
				this.disconnect()
				return null
			} finally {
				this.#refreshPromise = null
			}
		})()

		return this.#refreshPromise
	}

	async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
		const token = await this.getValidAccessToken()
		if (!token) return null

		const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`

		const res = await fetch(url, {
			...options,
			headers: {
				...options.headers,
				Authorization: `Bearer ${token}`,
			},
		})

		if (!res.ok) {
			if (res.status === 401) {
				this.disconnect()
			}
			console.error(`Spotify API error ${res.status}: ${res.statusText}`)
			return null
		}

		if (res.status === 204) {
			return {} as T
		}

		return (await res.json()) as T
	}

	async refreshProfile(): Promise<SpotifyUserProfile | null> {
		const profile = await this.fetchApi<SpotifyUserProfile>('/me')
		if (profile) {
			this.#profile = profile
			localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile))
		}
		return profile
	}

	// Web Playback SDK Initialization
	async initPlayerSdk(): Promise<void> {
		if (typeof window === 'undefined' || !this.isConnected || !this.isPremium) return
		if (this.#player || this.#isSdkLoading) return

		this.#isSdkLoading = true

		const createPlayer = () => {
			const Spotify = (window as any).Spotify
			if (!Spotify) return

			this.#player = new Spotify.Player({
				name: 'Adi Music Player',
				getOAuthToken: (cb: (token: string) => void) => {
					this.getValidAccessToken().then((token) => cb(token || ''))
				},
				volume: 0.8,
			})

			this.#player.addListener('ready', ({ device_id }: { device_id: string }) => {
				this.deviceId = device_id
				console.info('Spotify Web Playback SDK Ready with Device ID', device_id)
			})

			this.#player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
				if (this.deviceId === device_id) {
					this.deviceId = null
				}
			})

			this.#player.addListener('player_state_changed', (state: any) => {
				if (!state) return

				const paused = state.paused
				const position = state.position / 1000
				const duration = state.duration / 1000

				if (this.onPlaybackStateChange) {
					this.onPlaybackStateChange({ paused, position, duration })
				}

				if (
					state.position === 0 &&
					state.paused &&
					state.track_window?.previous_tracks?.length > 0 &&
					state.restrictions?.disallow_resuming_reasons?.includes('not_paused')
				) {
					this.onTrackEnded?.()
				}
			})

			this.#player.addListener('initialization_error', ({ message }: { message: string }) => {
				console.error('Spotify Playback SDK Initialization Error:', message)
				if (typeof (window as any).snackbar === 'function') {
					;(window as any).snackbar(`Spotify error: ${message}`)
				}
			})

			this.#player.addListener('authentication_error', ({ message }: { message: string }) => {
				console.error('Spotify Playback SDK Authentication Error:', message)
				this.disconnect()
			})

			this.#player.addListener('account_error', ({ message }: { message: string }) => {
				console.error('Spotify Playback SDK Account Error:', message)
			})

			this.#player.connect()
		}

		if ((window as any).Spotify) {
			createPlayer()
			this.#isSdkLoading = false
			return
		}

		;(window as any).onSpotifyWebPlaybackSDKReady = () => {
			createPlayer()
			this.#isSdkLoading = false
		}

		if (!document.getElementById('spotify-player-sdk')) {
			const script = document.createElement('script')
			script.id = 'spotify-player-sdk'
			script.src = 'https://sdk.scdn.co/spotify-player.js'
			script.async = true
			document.body.appendChild(script)
		}
	}

	// Spotify Web API Browsing endpoints
	async search(query: string): Promise<MusicProviderSearchResult> {
		if (!query.trim()) {
			return { tracks: [], albums: [], artists: [], playlists: [] }
		}

		const data = await this.fetchApi<any>(
			`/search?q=${encodeURIComponent(query)}&type=track,album,artist,playlist&limit=20`,
		)

		if (!data) {
			return { tracks: [], albums: [], artists: [], playlists: [] }
		}

		const tracks: TrackData[] = (data.tracks?.items || []).map((t: any) => this.mapSpotifyTrack(t))
		const albums: AlbumData[] = (data.albums?.items || []).map((a: any) => this.mapSpotifyAlbum(a))
		const artists: ArtistData[] = (data.artists?.items || []).map((a: any) => this.mapSpotifyArtist(a))
		const playlists: PlaylistData[] = (data.playlists?.items || [])
			.filter((p: any) => p !== null)
			.map((p: any) => this.mapSpotifyPlaylist(p))

		return { tracks, albums, artists, playlists }
	}

	async getLikedTracks(): Promise<TrackData[]> {
		const data = await this.fetchApi<any>('/me/tracks?limit=50')
		if (!data?.items) return []
		return data.items.map((item: any) => this.mapSpotifyTrack(item.track))
	}

	async getRecentlyPlayed(): Promise<TrackData[]> {
		const data = await this.fetchApi<any>('/me/player/recently-played?limit=50')
		if (!data?.items) return []
		return data.items.map((item: any) => this.mapSpotifyTrack(item.track))
	}

	async getUserPlaylists(): Promise<PlaylistData[]> {
		const data = await this.fetchApi<any>('/me/playlists?limit=50')
		if (!data?.items) return []
		return data.items.map((p: any) => this.mapSpotifyPlaylist(p))
	}

	async getPlaylistTracks(playlistId: string): Promise<TrackData[]> {
		const data = await this.fetchApi<any>(`/playlists/${playlistId}/tracks?limit=100`)
		if (!data?.items) return []
		return data.items.filter((i: any) => i.track).map((i: any) => this.mapSpotifyTrack(i.track))
	}

	async getAlbumTracks(albumId: string): Promise<TrackData[]> {
		const album = await this.fetchApi<any>(`/albums/${albumId}`)
		if (!album) return []
		const items = album.tracks?.items || []
		return items.map((t: any) => {
			// Attach parent album artwork to track
			if (!t.album) {
				t.album = album
			}
			return this.mapSpotifyTrack(t)
		})
	}

	async getArtistTopTracks(artistId: string): Promise<TrackData[]> {
		const data = await this.fetchApi<any>(`/artists/${artistId}/top-tracks?market=from_token`)
		if (!data?.tracks) return []
		return data.tracks.map((t: any) => this.mapSpotifyTrack(t))
	}

	// Playback Control Methods
	async playTrack(track: TrackData): Promise<boolean> {
		if (!this.isConnected || !this.isPremium) return false
		if (!track.url?.startsWith('spotify:')) return false

		await this.initPlayerSdk()

		let attempts = 0
		while (!this.deviceId && attempts < 20) {
			await new Promise((r) => setTimeout(r, 150))
			attempts++
		}

		if (!this.deviceId) {
			console.warn('Spotify Web Playback device is not ready yet.')
			return false
		}

		const res = await this.fetchApi(`/me/player/play?device_id=${this.deviceId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ uris: [track.url] }),
		})

		return res !== null
	}

	async pause(): Promise<void> {
		if (this.#player) {
			await this.#player.pause()
		} else if (this.deviceId) {
			await this.fetchApi(`/me/player/pause?device_id=${this.deviceId}`, { method: 'PUT' })
		}
	}

	async resume(): Promise<void> {
		if (this.#player) {
			await this.#player.resume()
		} else if (this.deviceId) {
			await this.fetchApi(`/me/player/play?device_id=${this.deviceId}`, { method: 'PUT' })
		}
	}

	async seek(positionSeconds: number): Promise<void> {
		const ms = Math.round(positionSeconds * 1000)
		if (this.#player) {
			await this.#player.seek(ms)
		} else if (this.deviceId) {
			await this.fetchApi(`/me/player/seek?position_ms=${ms}&device_id=${this.deviceId}`, {
				method: 'PUT',
			})
		}
	}

	async setVolume(volumePercentage: number): Promise<void> {
		const vol = Math.max(0, Math.min(1, volumePercentage / 100))
		if (this.#player) {
			await this.#player.setVolume(vol)
		}
	}

	// Map Helpers
	mapSpotifyTrack(item: any): TrackData {
		const id = stringToNegativeId(`spotify:track:${item.id}`)
		const fullImage = item.album?.images?.[0]?.url || item.images?.[0]?.url || ''
		const smallImage = item.album?.images?.[2]?.url || item.album?.images?.[0]?.url || fullImage

		const trackData: TrackData = {
			id,
			uuid: `spotify:track:${item.id}`,
			name: item.name,
			album: item.album?.name || 'Unknown Album',
			artists: item.artists?.map((a: any) => a.name) || ['Unknown Artist'],
			year: item.album?.release_date ? item.album.release_date.split('-')[0] : '',
			duration: Math.round((item.duration_ms || 0) / 1000),
			genre: [],
			trackNo: item.track_number || 1,
			trackOf: 1,
			discNo: item.disc_number || 1,
			discOf: 1,
			image: fullImage
				? {
						optimized: true,
						full: fullImage,
						small: smallImage,
				  }
				: undefined,
			url: `spotify:track:${item.id}`,
			scannedAt: Date.now(),
			type: 'track',
			favorite: false,
		}

		registerSpotifyTrack(trackData)
		return trackData
	}

	mapSpotifyAlbum(item: any): AlbumData {
		const id = stringToNegativeId(`spotify:album:${item.id}`)
		return {
			id,
			uuid: `spotify:album:${item.id}`,
			name: item.name,
			artists: item.artists?.map((a: any) => a.name) || [],
			year: item.release_date ? item.release_date.split('-')[0] : '',
			type: 'album',
		}
	}

	mapSpotifyArtist(item: any): ArtistData {
		const id = stringToNegativeId(`spotify:artist:${item.id}`)
		return {
			id,
			uuid: `spotify:artist:${item.id}`,
			name: item.name,
			type: 'artist',
		}
	}

	mapSpotifyPlaylist(item: any): PlaylistData {
		const id = stringToNegativeId(`spotify:playlist:${item.id}`)
		return {
			id,
			uuid: `spotify:playlist:${item.id}`,
			name: item.name,
			description: item.description || '',
			createdAt: Date.now(),
			type: 'playlist',
		}
	}
}

export const spotifyService = new SpotifyService()
