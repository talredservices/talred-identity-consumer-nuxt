# Contributing

Use Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm check
```

Keep integration additions protocol-focused and server-safe. A change to the Talred Identity API v1 handoff contract must include a fixture or contract test update and a documented compatibility decision.

Before opening a pull request, run `pnpm pack --dry-run` and verify that no credentials, test fixtures, or source-only files are included in the tarball.
