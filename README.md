# flOw: a tribute

Play [flOw](https://www.jenovachen.com/flowingames/flowing.htm), Jenova Chen's 2006 Flash game, in the browser: **https://br3nt.github.io/flow-tribute/**

Copies of flOw on archive sites today boot into an empty black sea. The game is more than its SWF: `core.swf` loads `levels.xml` (every level's colour, food, creatures and bosses) and streams its music from the folder it sits in. Without those files there is nothing to eat. This page hosts all of them together and plays them with [Ruffle](https://ruffle.rs).

## Files

`game/` holds the game exactly as Jenova Chen's server still serves it, unmodified:

- Primary source: https://www.jenovachen.com/flowingames/implementations/flowing/ (`core.swf`, `levels.xml`, 41 MP3s)
- Original page: https://www.jenovachen.com/flowingames/flowing.htm (its play link no longer works; [Wayback copy](https://web.archive.org/web/2020/http://www.jenovachen.com/flowingames/implementations/flowing/core.html))
- Offline version, April 2006: [`flOw_04142006.zip`](http://interactive.usc.edu/projects/cloud/flowing/flOw_04142006.zip) on USC's server (same `levels.xml` and MP3s, three SWF builds, Windows and classic Mac OS projectors)
- Source code, April 2006: [`flOw_source.zip`](https://web.archive.org/web/2016/http://www.jenovachen.com/flowingames/implementations/flowing/flOw_source.zip) on the Wayback Machine
- Internet Archive: https://archive.org/details/flash_flow (the offline zip's three SWFs, without `levels.xml` or the music)

| File | sha256 |
| --- | --- |
| `core.swf` | `95bdb4c864a3554bfe1dad0b2dadd8ab8ce20e003569fc76f5ed7d7aa8f7af7f` |
| `levels.xml` | `fb968658e219c81272e86181769df8f6f771515ff103168f82adde1db40b4c8b` |

## Run locally

Any static server from the repo root, for example `python3 -m http.server 8000`, then open http://localhost:8000/. Ruffle is loaded from unpkg (`@ruffle-rs/ruffle@0.6.0`).

## Credits

flOw © 2006 Jenova Chen. Jenova Chen: producing, game design, engineering, visual art. Nicholas Clark: game design, engineering. Austin Wintory: sound design, music.

This is a fan tribute with no affiliation to Jenova Chen or thatgamecompany. The game files are hosted so the game can be played. If you are a rights holder and want them removed, open an issue and they will be taken down.

The page itself (`index.html`, `style.css`, `ocean.js`, `app.js`) is MIT licensed; see `LICENSE`. The license does not cover anything in `game/`.
