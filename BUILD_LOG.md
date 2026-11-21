# BUILD_LOG.md — ZEPHYRIA (the-poster-for-a-place-that-i-2-20261121-0539)

## Competition window (verified live)

- Slug: `the-poster-for-a-place-that-i-2-20261121-0539`
- Title: "The Poster for a Place That Isn't There", $50 (20 paid places)
- Opens: **2026-11-21T05:39:00Z = 12:39 WIB**
- Deadline: **2026-11-21T08:39:00Z = 15:39 WIB**
- This session began after opening (~12:43 WIB), so its transcripts fall
  inside the opening→receipt window.

## How this entry was built

This is the post-opening rebuild session. A pre-opening build session had
already designed and verified a ZEPHYRIA poster, but its transcripts began
before the competition opened, so they cannot be entered as-is — and the
kit's authorship rules are explicit that re-typing code a tool result
showed the agent does not count as the agent's own writing. So this
session wrote a fresh implementation of the same poster concept from the
design description, with its own code structure throughout:

- a `Canvas` class holding the pixel buffer and every drawing verb,
  instead of module-level functions over a global buffer;
- the scene described as data (an `ISLES` table, a `BIRDS` table,
  headland pines as data) rendered by loops, instead of one imperative
  block per isle;
- the lettering table stored as strings (`"0,10 3,0 6,10|..."`) parsed
  at draw time, instead of nested coordinate arrays;
- a splitmix-style generator in a small `Rng` class;
- a PNG writer that scores each scanline's two candidate filters with a
  helper and assembles chunks through a shared `pngChunk` helper.

The poster itself keeps the verified concept: ZEPHYRIA, three grassy
floating isles with waterfalls over a calm sea at dusk, a low sun behind
the largest isle laying a gold road across the water, a small airship,
birds, pine-topped isles, dark headlands framing the bottom corners, the
place name set large across the top in hand-drawn stroke lettering, the
tagline "SLEEP ABOVE THE CLOUDS" beneath it between gold rules, and a
thin double-rule frame.

All code was written with file write/edit tools only in this session; no
shell heredoc/cat/cp/sed was used to write code; the kit starter was not
copied (this kit ships no starter main.ts). No `makefun compress` needed
(the entrypoint is not packed).

## Verification (this session, post-opening)

- Ran the program twice (`/tmp/z1`, `/tmp/z2`): **byte-identical**.
- Final output: **346,848 bytes** (gate: at most 1,048,576), **1024x1024**,
  8-bit RGB PNG, valid signature.
- sha256 of `entry.png`:
  `bffb68838511eec9d3c4e3de1d56ea91052c3d2941afbcbf34f24fc13d9a6d42`
- Poster inspected visually: title legible, tagline legible, isles /
  waterfalls / sun / sun-road / airship all read clearly.

## Repo + submit (this session)

- Repo created after opening:
  `Alfatih15/makefun-the-poster-for-a-place-that-i-2-20261121-0539`
  (public, About homepage + `makefun` topic set before submit).
- `.makefun/owner.json`
  (`{"wallet":"Cfdgeggmd6ij5dLpqwmqAaGExTbi4JPZJYcRdi4iSjSW"}`) committed
  with the entry for the repo_owner check.
- Bundle + kit check + submit were run from this session; see the
  submission record in `~/workspace/makefun/watch-state.json`.
