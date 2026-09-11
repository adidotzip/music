import { describe, expect, it, beforeEach } from 'vitest'
import { spotifyService, stringToNegativeId } from '../spotify.ts'

describe('Spotify Service', () => {
	beforeEach(() => {
		spotifyService.disconnect()
		localStorage.clear()
	})

	it('should generate consistent negative ID for Spotify URIs', () => {
		const id1 = stringToNegativeId('spotify:track:12345')
		const id2 = stringToNegativeId('spotify:track:12345')
		const id3 = stringToNegativeId('spotify:track:67890')

		expect(id1).toBeLessThan(0)
		expect(id1).toBe(id2)
		expect(id1).not.toBe(id3)
	})

	it('should map Spotify track item correctly to TrackData', () => {
		const spotifyItem = {
			id: '4cOdK2wGLETKBW3PvgPWqT',
			name: 'Never Gonna Give You Up',
			album: {
				name: 'Whenever You Need Somebody',
				release_date: '1987-11-12',
				images: [
					{ url: 'https://i.scdn.co/image/full.jpg' },
					{ url: 'https://i.scdn.co/image/medium.jpg' },
					{ url: 'https://i.scdn.co/image/small.jpg' },
				],
			},
			artists: [{ name: 'Rick Astley' }],
			duration_ms: 213000,
			track_number: 1,
			disc_number: 1,
		}

		const trackData = spotifyService.mapSpotifyTrack(spotifyItem)

		expect(trackData.name).toBe('Never Gonna Give You Up')
		expect(trackData.album).toBe('Whenever You Need Somebody')
		expect(trackData.artists).toEqual(['Rick Astley'])
		expect(trackData.duration).toBe(213)
		expect(trackData.year).toBe('1987')
		expect(trackData.url).toBe('spotify:track:4cOdK2wGLETKBW3PvgPWqT')
		expect(trackData.image?.full).toBe('https://i.scdn.co/image/full.jpg')
		expect(trackData.id).toBeLessThan(0)
	})

	it('should handle disconnect properly', () => {
		localStorage.setItem('spotify_tokens', JSON.stringify({ accessToken: 'test', refreshToken: 'ref', expiresAt: Date.now() + 10000 }))
		localStorage.setItem('spotify_profile', JSON.stringify({ id: 'user1', display_name: 'Test', product: 'premium' }))

		spotifyService.disconnect()

		expect(spotifyService.isConnected).toBe(false)
		expect(spotifyService.userProfile).toBeNull()
		expect(localStorage.getItem('spotify_tokens')).toBeNull()
	})
})
