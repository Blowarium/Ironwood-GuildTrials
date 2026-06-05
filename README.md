# Ironwood Guild Trials Coordinator

Weekly planner for **Guild Trials** in Ironwood RPG. Guild members pick one skill and one day per week; officers see coverage at a glance.

## Features

### Weekly trial planner (main view)
- **Skills × days grid** (Mon–Sun) — click any cell to assign
- Each cell shows **member name** and **status** (Planned / Active / Completed)
- **Drag between cells** to move a trial to another skill or day
- **Coverage column** per skill (e.g. `4/7` days covered)

### Guild summary
- **Week coverage** — % of members assigned
- **Assigned members** — e.g. `23/25`
- **Unassigned** list

### Other views
- **Drag & drop board** — group by day; drag trials between days
- **Members** — who’s assigned vs unassigned; click to edit
- **Smart suggestions** — optimal assignments using top-3 skills, in-game **XP/h**, and **Guild Trial Hall level** (trial XP required = `8,000 × (level + 1)`; each member contributes **5%** of skill XP earned during their 24h trial)

### Member profile & roles
- **Guild Leader**, **Guild Officer**, **Guild Member** (Blowarium defaults to Leader)
- **My profile** — XP/h and priority rank (1–16) for all skills; drag rows or type ranks
- **Guild roster** tab (Leaders/Officers) — track profile completion; Leader assigns roles
- Members edit only their own signups; Leaders/Officers can edit/move/remove anyone’s trials
- **Apply all suggestions** and **Trial Hall level** — Leaders and Officers only

### Member preferences (legacy)
- Old top-3 prefs API remains for compatibility; smart suggestions use full profiles

### Rules
- **All 16 skills** should be completed each week — use **Mark done** when that skill’s guild trial is finished (separate from individual signups)
- Skills **in progress** have signups but aren’t marked done yet (may need another member)
- **One trial per member per week** (one skill, one day)
- **Multiple members** can run the same skill on the same day

### No login
- Pick your name from the dropdown; the browser remembers it

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `DATABASE_URL`, the app uses **dev mode** (in-memory data). For shared data, add Neon Postgres — see below.

## Deploy free (Vercel + Neon)

1. Push this repo to GitHub.
2. Import at [vercel.com/new](https://vercel.com/new).
3. Add **Neon** storage (free) — Vercel sets `DATABASE_URL`.
4. Run [`schema.sql`](./schema.sql) in the Neon SQL editor.  
   If you deployed an older version, run [`migrations.sql`](./migrations.sql) too.
5. Deploy and share the URL (e.g. `guildtrials.vercel.app`).

## Customize members or skills

Edit [`src/lib/constants.ts`](./src/lib/constants.ts) and redeploy.

## Tech

- Next.js · Tailwind CSS · Neon Postgres (works the same as Supabase for this app’s needs)
