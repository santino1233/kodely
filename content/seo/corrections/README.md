# Corrections to live blog posts

The 56 posts on kodely.me have no source in this repo. Their only source of
truth is the `BlogPost` table on the production box. `seo-batch1.json` holds
14 of them and is a *snapshot*, not the source — it is left untouched, because
editing it would create a second thing that looks authoritative and isn't.

So a correction here is a surgical, literal find-and-replace against a live
row, run by `scripts/seo/correct-live.mjs`. Each file in this directory is one
group of related corrections.

## The three groups

| file | gate | what it fixes |
|---|---|---|
| `credit-figure.json` | none | Removes the published "a typical first build runs 100–150 credits" figure. **No number replaces it.** |
| `capability-claims.json` | none | Posts promising a working booking/contact form, a multi-page site, or photos you add later. |
| `export-claim.json` | `export-shipped` | Inverts "there is no zip or full-project download" — **only valid once the export route deploys.** |

## Read this before touching `export-claim`

`app/api/projects/[id]/export/route.ts`, `lib/zip.ts` and the **Download .zip**
button in `app/projects/[id]/Editor.tsx` are all **untracked in git**. The
feature is built and not deployed. That means every "there is no zip export"
sentence on kodely.me is **true right now**.

It stops being true the moment that code ships. There is no ordering that is
safe on either side of the deploy:

- run it early and ~30 live pages advertise a button that does not exist;
- run it late and ~30 live pages tell a developer evaluating the product that
  the thing they are looking at cannot be exported. Two of them
  (`kodely-vs-rocket-new`, `kodely-vs-lovable`) print it in a comparison table
  as a column where a competitor wins.

**Ship the corrections in the same deploy window as the export route.** The
`--gate export-shipped` flag exists so that running the corrector on a normal
day cannot do this by accident: the group is skipped, loudly, unless the
operator asserts the gate on the command line.

## Procedure

Run everything from a checkout on the production box, with `DATABASE_URL`
pointing at the production database.

### 1. Before the deploy — the two ungated groups

```
node scripts/seo/correct-live.mjs --group credit-figure --group capability-claims
```

Read the whole dry run. Three things to look for:

- **`change`** lines — the before/after of every edit. Read the `+` text.
- **`STALE`** — neither the old text nor the new text is in the row. The live
  copy has drifted from what these files were written against. Fix the edit
  against the real row; do not force anything.
- **`RESIDUE`** — a row still matching the group's `detect` patterns after the
  planned edits. This is the part that catches the 42 live posts this repo has
  no copy of. Every residue line is a place still making the claim.

For residue, get the exact current text and write a replacement:

```
node scripts/seo/correct-live.mjs --group credit-figure --emit-stubs
```

That writes `content/seo/corrections/pending.generated.json` with the exact
matched text as `find` and an empty `replace`. Fill each `replace` in, move the
entries into the right group file, delete the generated file, re-run the dry
run. Repeat until the sweep is clean.

Then apply:

```
node scripts/seo/correct-live.mjs --group credit-figure --group capability-claims --apply
```

The script exits non-zero while any stale edit or residue remains, so a clean
exit code is the signal that the whole class is gone — not just the rows
somebody remembered.

### 2. In the export deploy window

Immediately after the deploy that ships the export route, in the same window:

```
node scripts/seo/correct-live.mjs --group export-claim
node scripts/seo/correct-live.mjs --group export-claim --apply
```

Then confirm, with the same command, that the sweep is clean. Anything left is
a page still denying a feature you just shipped.

`app/blog/[slug]/page.tsx` is `force-static` with `revalidate = 3600`, so a
corrected page can take up to an hour to change for visitors. That is worth
knowing before someone concludes the script did nothing.

## Properties the corrector guarantees

- **Literal matches only.** No regex ever rewrites live prose. An edit that no
  longer matches changes nothing and is reported as `STALE`.
- **Idempotent.** An edit already applied is `already corrected` and skipped.
  Only `bodyHtml` is written, so `@updatedAt` does not churn on a re-run.
- **Non-destructive.** Update-by-slug only. No create path, no delete path.
- **It checks its own work.** The `detect` sweep runs over *every* row in the
  table, including posts no correction file names.
