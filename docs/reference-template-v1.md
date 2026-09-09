# Phase 9A.8 — `reference-template-v1`

## Scope retained

This change only replaces the PDF presentation layer. `buildResumeContent`,
requirement resolution, evidence statuses, readiness, gap analysis,
anti-invention validation, matching, ingestion, auto-apply and the Supabase
schema are unchanged. New artifacts receive `reference-template-v1`; existing
immutable `adaptive-resume-v1` PDFs are neither read nor modified.

The renderer still consumes `ResumeContent` and `planAdaptiveResumeLayout`.
Consequently, it renders only validated, VERIFIED content selected for the
offer. It does not add content or infer skills.

## Visual comparison

The reference family has a large name/header, a clear dominant content area,
a complementary zone, rules between sections and discrete project units.
`reference-template-v1` implements those traits with a 338pt main column and
a 166pt secondary rail: summary/projects/experience occupy the main zone;
dynamic skills, training, certificates and languages occupy the rail. The
rail title comes from the planner (`Tecnologías`, `Competencias clínicas`,
`Sistemas y herramientas` or `Competencias`), not a hard-coded technology
label. Project cards use metadata, factual description, bullets/link and a
light rule rather than a heavy box.

The design intentionally is not pixel-perfect: it uses no reference photo by
default, keeps the optional approved photo path, and uses the available
validated content rather than fixed section names or filler. Compared with the
previous linear renderer, hierarchy, whitespace, main/secondary areas and
project separation are materially closer to the approved reference family.

## ATS strategy comparison

Both strategies are rendered and parsed in `tests/derived-resumes.test.ts`
with `pdf-parse`:

| Strategy | Visual result | `pdf-parse` result | Decision |
| --- | --- | --- | --- |
| `PHYSICAL_COLUMNS` | Simultaneous dominant main area and narrow secondary rail; closest to the reference. | Header, every section, all skills and link text are selectable. Extraction follows PDF coordinates, so adjacent-zone headings may interleave rather than form one strict stream. | Chosen. The extracted text remains complete and understandable while preserving the intended composition. |
| `SEMANTIC_RAIL` | Main area followed by a visually ruled secondary block. | Strict main-then-secondary reading order. | Kept only as a deterministic comparison path; it is less faithful because the secondary area is no longer a sidebar. |

Clickable links remain PDF annotations. The physical strategy is used by
`renderResumePdf`; the sequential alternative is not persisted.

## Canonical evidence audit

The in-memory `Web Developer — Canonical` golden fixture verifies all
prioritized skills before rendering. Its expected evidence sources are:

| Skill | Verified source |
| --- | --- |
| React | Project |
| JavaScript | Project |
| HTML | Project, Training |
| CSS | Project, Training |
| Tailwind CSS | Project |
| Node.js | Project |
| Express | Project |
| REST | Project |
| Supabase | Project |
| PostgreSQL | Project |
| SQL | Project |
| Git | Training |
| GitHub | Resume, Training |
| Vite | Project |

No prioritized Canonical skill was removed: every listed value is present in
the verified evidence constructed from the approved-source-shaped Resume,
Project or Training text. CandidateProfile is not used as evidence for any of
these skills.

## Golden artifact

The test generates the PDF and first-page PNG in memory and asserts that the
PNG has raster content. With `PHASE9A_VISUAL_DIR` set, it writes only temporary
inspection copies named `canonical-reference-template-v1.pdf` and
`canonical-reference-template-v1-page-1.png`; this does not create a
`DerivedResume` or write Supabase storage.

## 9A.8.1 density and hierarchy correction

The first Canonical screenshot used only its upper half because the golden
fixture did not contain the approved employment blocks and represented the
two training entries as mixed single lines. This was a fixture/content-shape
gap, not a reason to enlarge type or add filler. The revised golden source
contains the verified compact employment identities and three-line training
records already supported by the existing evidence model.

The deterministic content budget is therefore: verified summary, relevant
projects, verified technical employment, then compact verified additional
employment in MAIN; verified skills, training, certifications and languages
remain in SIDEBAR. Additional employment is no longer visually labelled as
"additional", but it remains compact and factual. Nothing is added when the
corresponding evidence is absent.

Project detail extraction now removes a source label such as `Proyecto:` and
does not place the same action both in description and highlights. The renderer
also suppresses empty `Proyecto:`, `Experiencia:`, `Stack:` and `Descripción:`
values. Training is rendered as three distinct lines (program, institution,
date), with no extracted skill list mixed into the educational entry.

The Canonical density screenshot moved from roughly 50% to roughly 75% of the
usable page height (an approximate visual measurement, not a pagination rule),
while retaining one A4 page. It recovers the verified panel-installation and
customer-service employment identities and the two verified 4Geeks training
records. The temporary inspection names for this revision are
`canonical-reference-template-v1-density.pdf` and
`canonical-reference-template-v1-density-page-1.png`.

## 9A.8.2 relevance-first depth audit

Depth was not lost by PDF drawing: CandidateEvidence retained the original
project lines, but `projectDetails` selected action lines in source order and
the previous Canonical golden supplied only one action per project. Additional
employment was intentionally reduced to identity lines by the compact section;
there were no verified responsibilities in the Canonical employment fixture to
render. ResumeContent and the renderer faithfully rendered the one selected
highlight they received.

The revised Canonical audit has the following verified source evidence and
selection at content depth level 0 (FULL):

| Evidence block | Available factual project evidence | Selected / rendered | Relevance reason |
| --- | --- | --- | --- |
| NutriSmartCoach | Description, React diet interface, REST nutrition integration, Supabase/PostgreSQL persistence | Description + 3 bullets | Highest match: React, REST, Supabase, PostgreSQL and SQL. |
| Consultorio Odontológico LAC | Description, React patient components, authentication/data synchronisation | Description + 2 bullets | Next strongest verified React/data match. |
| VHSFlix | Description, React catalogue views, TMDB/YouTube integration | Description + 1 bullet | Relevant React project but fewer direct offer signals. |
| Panel installation | Role, employer, dates/location; no responsibility after identity | Compact identity only | Verified employment, but no direct web relevance or supported responsibility. |
| Customer service (Isadri) | Role, employer, dates/location; no responsibility after identity | Compact identity only | Same. |
| Customer service (Carrefour) | Role, employer, dates/location; no responsibility after identity | Compact identity only | Same. |

`projectHighlightBudget` now applies deterministic full depth of 3/2/1 for
primary/secondary/tertiary projects. It ranks verified action lines by overlap
with required skills, preferred skills and offer keywords. A project with zero
measurable relevance is not added when a relevant project exists. Its
progressive-compaction design is L0 3/2/1, L1 3/1/1, L2 2/1/1, L3 1/1/1 and
L4 1/0/0; lower priority is reduced first. Canonical fits at L0, so no
compaction is applied.

The summary changed from a "Tecnologías acreditadas" list to a factual claim
that those verified technologies were applied in verified projects. It does
not assert professional technical employment, seniority or duration.

With real additional project evidence, the temporary depth golden occupies
roughly 80% of the usable A4 height (versus roughly 75% in 9A.8.1), remains one
page, and still uses only source-backed facts.

## 9A.8.3 adaptive visual density

Density is a renderer-only decision: `ResumeContent` is not mutated. The
estimator counts rendered summary characters, structured project descriptions
and highlights, compact employment records, training entries, skill groups and
languages. It explicitly avoids double-counting the source sections that are
already represented by structured content. Scores below 28 select `RELAXED`,
28–42 select `STANDARD`, and 43 or higher select `COMPACT`.

`RELAXED` uses 27pt name, 13pt headline, 11.5pt main headings, 10.5pt sidebar
headings, 10.35pt body, 9.5pt metadata and a 1.22 line height, with greater
section/card/item spacing. `STANDARD` retains the former 26/12.5/11.3/10pt
rhythm. `COMPACT` uses a 9.5pt body minimum and only follows an observed page
overflow after the normal content-depth policy; it never changes evidence.
If a relaxed rendering crosses to a second page, the renderer retries standard,
then compact, retaining all text rather than cutting it.

Canonical scores `RELAXED`. Its content JSON SHA-256 is compared before and
after rendering in the golden test, so visual density cannot alter content.
The relaxed screenshot occupies roughly 88% of usable vertical space, compared
with roughly 80% at the former standard density, and remains a single A4 page.
Text extracted with `pdf-parse` is compared as pagination-insensitive content;
links and semantic section data remain unchanged. Temporary inspection output:
`canonical-reference-template-v1-relaxed.pdf` and
`canonical-reference-template-v1-relaxed-page-1.png`.
