# synclair

**A project foundation you clone, not a package you install.**

```
npx synclair new my-project
cd my-project
npm install && npm run dev    # hub at http://localhost:4100/synclair
```

Synclair gives a project one aligned source of truth — design tokens, a live
component library (shadcn-style registry with UX docs), and an AI knowledge
layer — served by an in-repo hub built for humans browsing and agents building.

This package is only the front door: it clones the
[foundation repo](https://github.com/joshuaiwata/synclair) and wires the mother
repo as your `upstream` remote. The source transfers to you (GPL-3.0); nothing
phones home, and updates stay opt-in (`npm run call-home` + the
`synclair-sync` skill).

Docs: [new project](https://github.com/joshuaiwata/synclair/blob/main/docs/new-project.md)
· [existing app](https://github.com/joshuaiwata/synclair/blob/main/docs/existing-project.md)
· [architecture](https://github.com/joshuaiwata/synclair/blob/main/docs/foundation-model.md)
· <https://synclair.dev>
