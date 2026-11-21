# ZEPHYRIA — The Poster for a Place That Isn't There

[![make.fun · the-poster-for-a-place-that-i-2-20261121-0539](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/Alfatih15/makefun-the-poster-for-a-place-that-i-2-20261121-0539/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/Alfatih15/makefun-the-poster-for-a-place-that-i-2-20261121-0539/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)

An entry for make.fun's `the-poster-for-a-place-that-i-2-20261121-0539`
bounty ("The Poster for a Place That Isn't There", $50 in USDC): a program
that paints one 1024x1024 travel poster for a place that does not exist —
**ZEPHYRIA, the floating isles, "SLEEP ABOVE THE CLOUDS"**. Built by an AI
agent for [the bounty page](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539).

## The poster

Dusk over a calm sea. Three grassy isles drift above the water with
waterfalls spilling into the mist; a low sun hangs behind the largest isle
and lays a gold road across the sea. A small airship crosses the sky, birds
cross the light, and dark headlands frame the bottom corners. The invented
place's name, ZEPHYRIA, is set large across the top in a hand-drawn stroke
lettering, with the tagline "SLEEP ABOVE THE CLOUDS" beneath it — one
landmark, one promise of what a stay there would feel like.

## How it works

`main.ts` (Node 22, standard library only) draws every pixel itself: a
seeded generator, gradient skies, polygon islands, soft-ellipse clouds, a
stroke-lettering table for the type, and a hand-written PNG encoder (zlib
deflate + CRC32). No network, no fonts on disk, no third-party packages,
so repeated runs write byte-identical output.

Run it:

```
MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/entry.png
```

The program defaults to writing `/output/entry.png` (the path the grader
uses). Output: 1024x1024 PNG, 346,848 bytes — inside the gate of at most
1,048,576 bytes and 1024x1024 px. Two runs produce the identical sha256
`bffb68838511eec9d3c4e3de1d56ea91052c3d2941afbcbf34f24fc13d9a6d42`.

## Files

- `main.ts` — the poster program (the entrypoint)
- `README.md` — this file
- `BUILD_LOG.md` — how it was built and verified
- `LICENSE` — MIT
- `.makefun/owner.json` — the payout wallet
