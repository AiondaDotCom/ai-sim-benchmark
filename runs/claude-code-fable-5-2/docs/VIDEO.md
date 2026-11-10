# X showcase video

Created on 2026-11-10 after the benchmark run, at the user's request.

- Final video: [water-fable-5-2-x.mp4](water-fable-5-2-x.mp4)
- Poster: [water-fable-5-2-x-poster.jpg](water-fable-5-2-x-poster.jpg)
- Original music: [music-elevenlabs-island-rain.mp3](music-elevenlabs-island-rain.mp3)

The video is 30 seconds, 1920 × 1080, 30 fps (900 frames), MPEG-4 container with H.264 High / yuv420p video and stereo AAC-LC audio at 48 kHz. Size: 11,318,601 bytes. Fast-start metadata precedes the media data.

The footage is an actual browser canvas recording (MediaRecorder, headless Chrome at a 1920 × 1080 viewport) of the existing production build with `?seed=1337&warmup=320`, i.e. after the build's own 320-simulated-second pre-roll so the clip opens on running streams and filled lakes. A separate recording canvas copies each rendered frame and adds the persistent text `Claude Fable 5.2` in the upper left. The simulation source is unchanged. No generated substitute footage was used.

## Music provenance

Original instrumental generated through the ElevenLabs music API (`POST /v1/music`, `force_instrumental: true`, requested length 32 seconds, output `mp3_44100_128`). Song ID: `IJOJuv4DaYwd0YUmf32Y`. One generation, used as returned. The licence status depends on the ElevenLabs plan of the generating account and has not been verified here.

Prompt:

> Instrumental cinematic chill electronic soundtrack for a 30-second showcase of a rainy mountain island water simulation. Sparkling plucked synth arpeggios suggesting running water, warm airy pads, soft rounded bass, light crisp downtempo percussion, 100 BPM, serene but forward-moving and uplifting. Immediate melodic hook in the first second, subtle lift around 12 seconds, gentle satisfying resolution at the end. Polished spacious mix. No vocals, no spoken words.

The first 30 seconds were normalized with FFmpeg loudnorm targeting -18 LUFS, with a 0.6-second fade-in and a 2.5-second fade-out. The final audio is non-silent and does not clip (measured mean -21.3 dB, sample peak -4.4 dBFS). Video frames at 15 and 29.8 seconds were visually checked for intact rendering, camera movement, and label readability; all 900 frames decoded. The music itself was not listened to by the orchestrator.

This is a prepared local upload artifact; it has not been posted to X.
