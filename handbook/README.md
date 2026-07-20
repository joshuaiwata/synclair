# Synclair Handbook — source for `docs.synclair.dev`

This folder is the **public handbook** for Synclair (the foundation itself, explained
to a human evaluating or installing it). It is **the single source of truth** for
that content — [Mintlify](https://mintlify.com) renders it to **`docs.synclair.dev`**
on every push. There is no second copy; the website *renders* these files, it does
not own them.

> Not to be confused with `docs/*.md` (one level up), which are the **internal**
> foundation specs written for maintainers and agents. This `handbook/` is the
> **reader-facing** front door that draws from them.

## Layout

| File | Page |
|---|---|
| `docs.json` | Mintlify config (theme, nav, domain) — schema: `https://mintlify.com/docs.json` |
| `index.mdx` | What is Synclair |
| `vs-storybook.mdx` | Synclair vs. Storybook |
| `how-it-works.mdx` | Where the database is; riding on git + your AI tools |
| `installation.mdx` | New project / beside an existing app |
| `setup-modes.mdx` | Embedded vs. watcher |
| `the-hub.mdx` | Tour of the `/synclair` sections |
| `agents-and-skills.mdx` | Skills & digger agents |
| `customizing.mdx` | The three-layer model; what's safe to change |
| `faq.mdx` | Fast answers |

## Editing

- Edit the `.mdx` files here in a normal PR. **When the foundation changes, update the
  matching handbook page in the same PR** — that's what keeps the docs from drifting.
- Preview locally with the Mintlify CLI:
  ```bash
  npm i -g mint
  cd handbook && mint dev      # http://localhost:3000
  ```
- On merge to `main`, Mintlify auto-deploys to `docs.synclair.dev`.

## First-time hosting setup (one-time, on the Mintlify dashboard)

1. Sign in at [mintlify.com](https://mintlify.com) (Starter plan — free for a public repo).
2. Connect the `joshuaiwata/synclair` repo and point it at this **`handbook/`** directory.
3. Set the custom domain to `docs.synclair.dev` and add the CNAME Mintlify provides.
4. Add a prominent **Docs** link from the `synclair.dev` marketing site (on Hatchable)
   to `docs.synclair.dev` so the two read as one product.
