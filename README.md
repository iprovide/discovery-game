# Discovery!

A small browser game about civil discovery, played by woodland creatures.

You are counsel. You get a fact pattern and the other side's initial
disclosures, and you draft a Rule 34 request for production: what kind of
documents, from when, and — if you have found the right thread to pull — from
which custodian, which server, under which label. Then you staff the review,
pack the box by hand, and watch your associates read.

The narrower and better-aimed the request, the more your team can actually get
through. Everything else is a gamble.

**Play it:** https://iprovide.github.io/discovery-game/

Needs a mouse and keyboard — the packing screen is drag-and-drop and there is no
touch equivalent yet.

---

## Playtesting

There is a **Feedback** button in the bottom-right corner of every screen, and
`F` opens it from anywhere. It attaches what you were doing — which screen, the
request you filed, how you staffed it, how full your box was, what you netted —
so you never have to describe your setup. Rough notes are more useful than tidy
ones.

The things worth telling us about:

- Did packing the box feel like a decision, or like tidying up?
- Did you ever empty the box and pack a few documents deliberately, or did you
  use the auto-pack every time?
- Before you filed, could you predict yourself? Did adding a qualifier feel like
  it did something?
- Were the findings funny?

## Running it locally

```
npm install
npm run dev
```

`npm run build` produces a static `dist/`. `node tools/sweep.mjs [samples]` runs
the balance harness against the real scan engine.

## Layout

- `src/scenes/` — the screens, in Phaser 3
- `src/systems/` — the scan engine, the packing grid, RNG, run state, case loader
- `src/data/cases/` — one JSON file per case; adding a case needs no code change
- `tools/` — the balance harness and the Notion authoring converters

Built with Phaser 3 and Vite. Art is placeholder rectangles until the art pass.
