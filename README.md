# DJ Tool - 2-channel all-in-one DJ mixer (YouTube / YouTube Music / Spotify / local files)

A browser-based two-deck "DJ" page, restyled to look like a 2-channel all-in-one DJ controller (black chassis, raised touchscreen, jog wheels, 8 backlit pads per deck, mixer in the middle). The artwork is original HTML/CSS/canvas - no manufacturer photos or logos are used. Plain HTML/CSS/JS, no build step, no accounts, no API keys. The chassis is drawn on a fixed 1700 px canvas and scaled to the window (best at 1100 px wide or more; narrower windows scroll sideways).

Each deck can hold a **YouTube / YouTube Music link, a Spotify link, or a local audio file** (mp3, wav, m4a, ogg, flac) from your own device. Local files are decoded in the browser with the Web Audio API and never leave your device.

## How to start (Windows)

1. Double-click **start.bat**.
2. A black window opens (leave it open) and your browser goes to **http://localhost:5500**.
3. Close the black window to stop it.

No Python or Node needed: start.bat runs `serve.ps1`, a tiny web server built into Windows PowerShell.

Why not just double-click index.html? YouTube refuses to play embedded videos on pages opened as a file (error 153), so the page must come from `http://localhost`. If you do open index.html directly, a red banner tells you to use start.bat.

Other ways to serve the folder (if you have them): `python -m http.server 5500` or `npx serve`, then open the URL shown. On GitHub Pages / any https web host it works as-is.

Use Chrome or Edge.

## Using it

- **Load a link**: paste into the deck's box on the touchscreen (it loads automatically) or press LOAD / Enter. Supported: `youtube.com/watch?v=`, `music.youtube.com/watch?v=`, `youtu.be/`, `youtube.com/playlist?list=`, and `open.spotify.com/track|album|playlist|episode/...` (also `spotify:track:ID`). A watch link with `&list=` loads just that video; use a `/playlist?list=` link for a whole playlist.
- **Load a local file**: LOAD FILE under a deck's panel, the LOAD 1 / LOAD 2 buttons beside the screen, or drag a file onto the deck or its screen panel.
- **Touchscreen**: SOURCE = two waveform strips + one track panel per deck (title, elapsed/remaining, overview/seek bar, the YouTube/Spotify player or the local-file waveform, link box, queue button, mix button). BROWSE = history list, PLAYLIST = queue list (both decks). The other tabs are decorative.
- **Status**: crossfader, auto-mix and handoff messages appear at the top of the touchscreen.

### Live controls (work for real)

| Control | Local file | YouTube | Spotify |
|---|---|---|---|
| PLAY/PAUSE, CUE (set / return / hold to preview) | yes | yes | yes |
| Jog wheel | spins with the track; drag the top = scratch (JOG MODE VINYL lit) or the outer ring = pitch-bend | spins while playing; dragging scrubs (seeks) | spins while playing; dragging seeks on release |
| TEMPO fader, TEMPO RANGE (+/-6, 10, 16, 50 %) | yes (pitch changes with speed, like vinyl) | yes, snaps to YouTube's speeds 0.25x-2x (pitch kept) | - |
| LOOP IN / OUT, 1/2 X, 2 X, RELOOP/EXIT | yes | RELOOP/EXIT = repeat track | repeat track |
| 8 hot-cue pads (tap = set / jump, Shift or SHIFT button + tap = delete; saved per file name + size) | yes | pads 1-4 = jump to 0 / 25 / 50 / 75 % | same once the duration is known |
| TRACK SEARCH (restart / next queued link), SEARCH (hold to scan) | yes | yes | next / restart only |
| Channel fader | yes | volume | - |
| TRIM, HI / MID / LOW EQ, COLOR (low-/high-pass filter sweep) | yes | - | - |
| Level meters | yes | - | - |
| BEAT FX: effect select (echo / flanger / reverb), channel select (1 / 2 / master), TIME, LEVEL/DEPTH, ON/OFF | yes | - | - |
| Real waveform overview + moving playhead | yes | decorative shape only | decorative shape only |

Knobs that cannot affect a streaming deck are dimmed while that deck is loaded. **CROSSFADER** (equal-power) and **MASTER LEVEL** apply to every source where the source allows it (Spotify embeds cannot be faded). **AUTO-MIX** (key M) starts the other deck and moves the crossfader over the FADE time (2-30 s); Spotify decks are handed off (start / stop) instead. **MIX ->** on a deck's panel is the same handoff with a 0-30 s delay. Double-click a knob or fader to reset it.

- **Queue / History** per deck: saved in your browser (localStorage). Click an entry to load it; when a track ends the next queued item loads and plays. (Local files can't be queued or restored after a refresh - the browser won't remember them - but their hot cues are.)
- **Keys**: Q = play/pause deck 1, P = play/pause deck 2, Left/Right = nudge crossfader, M = auto-mix.

### Decorative (drawn to match the look, not wired)

MIC, AUX, USB slots / STOP / MASTER REC / TRACK MARK, browse knob and its buttons, headphone CUE / MIXING / LEVEL, BOOTH MONITOR, TAP, SOUND COLOR FX buttons, PARAMETER, CROSSFADER CURVE, input selectors, SLIP, QUANTIZE, DIRECTION REV, BEAT SYNC, MASTER TEMPO, JOG ADJUST, VINYL SPEED ADJ, CUE/LOOP CALL, DELETE, MEMORY, the other pad modes, and the TAG LIST / SEARCH / MENU tabs. They show a "Not available in the web version" tooltip. There is **no BPM detection, SYNC or beat-matching**.

## Limits (be aware)

- YouTube and Spotify audio comes from the official players, so EQ, filters, effects, scratching, metering and sample-accurate sync are **not** possible for those decks. Only local files get the full signal chain.
- Spotify may need you to be logged in to Spotify in the browser for full tracks; otherwise you get 30-second previews.
- Some YouTube videos block embedding and will show an error.
- Browsers may block sound until you click once on the page.
- Nothing is downloaded, recorded, uploaded or modified.

## Files

- `index.html`, `css/style.css` - the page and the controller artwork
- `js/ui.js` (knobs, faders, scaling), `js/audio.js` (Web Audio engine for local files), `js/app.js` (decks, mixer, YouTube / Spotify, screen) - the app
- `start.bat`, `serve.ps1` - local launcher / server