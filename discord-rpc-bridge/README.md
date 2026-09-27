# Adi Music Discord Rich Presence

This optional companion connects Adi Music in the browser to the Discord desktop client.

## Requirements

- Node.js 22+
- Discord desktop running
- A Discord application with Rich Presence enabled

Create a Discord application in the Developer Portal and copy its **Application ID**.

The bridge uses Adi Music's public app icon as the default Rich Presence image. You can optionally override it with `DISCORD_LARGE_IMAGE_KEY` if you upload a custom asset.

## Run

From this directory:

```bash
pnpm install
DISCORD_CLIENT_ID=your_application_id pnpm discord-rpc
```

On Windows PowerShell:

```powershell
$env:DISCORD_CLIENT_ID="your_application_id"
$env:DISCORD_LARGE_IMAGE_KEY="adi_music"
pnpm start
```

The bridge listens only on `127.0.0.1:6463`.

When Adi Music is open at `https://music.imreallyadi.space`, it can send playback state to the bridge. If the bridge is not running, Adi Music simply continues without Discord Rich Presence.

## Presence

The bridge publishes:

- current track title
- artist
- album
- playing state
- playback timestamps
- Adi Music artwork
