# Adi Music native app

Adi Music uses Tauri 2 for its native desktop and Android builds.

## Desktop

Install the Tauri CLI if needed:

    pnpm dlx @tauri-apps/cli@latest info

Run the desktop app:

    pnpm dlx @tauri-apps/cli@latest dev

Build installers:

    pnpm dlx @tauri-apps/cli@latest build

## Android

After installing Android Studio and the Android SDK:

    pnpm dlx @tauri-apps/cli@latest android init

Run on an emulator/device:

    pnpm dlx @tauri-apps/cli@latest android dev

Build the Android package:

    pnpm dlx @tauri-apps/cli@latest android build

The web/PWA build remains available independently at https://music.imreallyadi.space.
