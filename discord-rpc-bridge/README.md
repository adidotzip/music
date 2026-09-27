# Adi Music Discord Rich Presence

This optional companion connects Adi Music in the browser to the Discord desktop client.

## Requirements

- Node.js 22+
- Discord desktop running
- A Discord application with Rich Presence
- Your Discord application **Client ID**
- Your Discord application **Client Secret**
- Your Discord account added as a tester if the application is not approved by Discord

Discord's current RPC API requires the IPC client to authenticate before it can call `SET_ACTIVITY`. The bridge performs that authorization locally and keeps the Discord credentials out of the Adi Music website.

## Discord application setup

1. Create an application in the Discord Developer Portal.
2. Copy the **Application ID**.
3. Copy the **Client Secret** from the application's OAuth2 settings.
4. Add this redirect URI to the application's OAuth2 redirect URIs:

```
http://127.0.0.1:6463/oauth/callback
```

5. If Discord has the application restricted to testers, add your Discord account to the application's tester list.

## Run

From the Adi Music repository root:

```bash
DISCORD_CLIENT_ID=your_application_id \
DISCORD_CLIENT_SECRET=your_client_secret \
pnpm discord-rpc
```

On Windows PowerShell:

```powershell
$env:DISCORD_CLIENT_ID="your_application_id"
$env:DISCORD_CLIENT_SECRET="your_client_secret"
pnpm discord-rpc
```

The bridge listens only on `127.0.0.1:6463`.

When Adi Music is open at `https://music.imreallyadi.space`, it sends playback state to the bridge. If the bridge is not running, Adi Music continues normally without Discord Rich Presence.

## Presence

The bridge publishes:

- current track title
- artist
- album
- Listening activity
- playback timestamps
- an **Open Adi Music** button

The bridge uses the Discord application's configured Rich Presence artwork. Album-cover artwork is not uploaded from the user's local library.

## Troubleshooting

If the bridge logs `4006`, the Discord RPC session is not authenticated. Make sure the Client Secret is correct and that your Discord account is allowed to test the application.

If Discord reports that the application is not allowed to use RPC, the application needs the appropriate Discord approval/tester access. Discord documents this restriction in the RPC authentication section.
