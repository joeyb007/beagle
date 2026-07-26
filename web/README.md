# Beagle web app (Branch C)

Separate Next.js project — scaffold with `npx create-next-app@latest .` in this
directory (own package.json; deps never conflict with the agent's).

Seam to the rest of the system: the shared SQLite DB (`../schema.sql`,
`../data.sqlite`) read/written with better-sqlite3. Never import agent code.
See docs/branch-c.md.
