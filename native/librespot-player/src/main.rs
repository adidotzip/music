use std::{env, process::exit};

use librespot::{
    core::{SpotifyUri, authentication::Credentials, config::SessionConfig, session::Session, spotify_id::SpotifyId},
    playback::{
        audio_backend,
        config::{AudioFormat, PlayerConfig},
        mixer::NoOpVolume,
        player::Player,
    },
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: adi-librespot-player <access-token> <track-id>");
        exit(2);
    }

    let credentials = Credentials::with_access_token(&args[1]);
    let track = SpotifyUri::Track {
        id: SpotifyId::from_base62(&args[2])?,
    };

    let backend = audio_backend::find(None).ok_or_else(|| anyhow::anyhow!("No audio backend available"))?;
    let session = Session::new(SessionConfig::default(), None);

    session.connect(credentials, false).await?;

    let player = Player::new(
        PlayerConfig::default(),
        session,
        Box::new(NoOpVolume),
        move || backend(None, AudioFormat::default()),
    );

    player.load(track, true, 0);
    player.await_end_of_track().await;

    Ok(())
}
