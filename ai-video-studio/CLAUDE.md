# AI Video Studio — CLAUDE.md

Enterprise-grade AI video production platform. Users provide brand direction; the app generates scripts (GPT-4o mini) and videos (Kling / Hailuo via fal.ai).

## Commands

```bash
cd ai-video-studio
npm run dev      # Dev server → http://localhost:5173
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint
```

## Architecture

```
src/
  App.tsx               # BrowserRouter → / (Landing) and /studio (VideoStudio)
  pages/
    Landing.tsx         # Marketing landing page
    VideoStudio.tsx     # 5-step wizard (all logic lives here)
  index.css             # Tailwind v4 import + global resets
  main.tsx              # React 19 root
```

## VideoStudio 5-Step Wizard

| Step | ID | What happens |
|------|----|--------------|
| 1 | `config` | API keys (OpenAI + fal.ai), model selection, content language |
| 2 | `brief` | Brand, audience, style, duration, aspect ratio, reference image |
| 3 | `script` | GPT-4o mini generates JSON script; user edits Kling prompts |
| 4 | `generate` | fal.ai model generates all scene clips in parallel |
| 5 | `result` | Preview + per-scene download links |

State persisted to `localStorage` keys: `avs_openai`, `avs_fal`, `avs_model`, `avs_lang`.

## AI Models (via fal.ai)

| Model | fal.ai ID | Cost | Best for |
|-------|-----------|------|----------|
| Hailuo 02 Pro | `fal-ai/minimax/hailuo-02/pro/text-to-video` | ~$0.27/6s | Default; best value |
| Hailuo 02 Img→Vid | `fal-ai/minimax/hailuo-02/standard/image-to-video` | ~$0.27/6s | First scene with reference |
| Kling 2.6 Pro | `fal-ai/kling-video/v2.6/pro/text-to-video` | ~$0.50/5s | Cinematic quality |
| Kling 2.6 Img→Vid | `fal-ai/kling-video/v2.6/pro/image-to-video` | ~$0.50/5s | First scene with reference |

### Hailuo camera control syntax (append to prompt)
`[Push in]` `[Pull out]` `[Dolly left]` `[Dolly right]` `[Pan left]` `[Pan right]`
`[Tilt up]` `[Tilt down]` `[Static shot]` `[Handheld shot]` `[Aerial shot]`

## Content Languages
- `zh` — Script concept/storyline/narration in Chinese; Kling prompts always English
- `en` — Full script in English; optimized for global marketing content

## Key Design Decisions
- All API keys stored in `localStorage` only (never sent to any server)
- `dangerouslyAllowBrowser: true` on OpenAI client — intentional for user-owned keys
- Scenes generated with `Promise.all` (parallel) to minimize wait time
- First scene auto-switches to image-to-video model when `referenceImageUrl` is set
- GPT-4o mini returns `{ type: "json_object" }` — always parse and validate `scenes[]`

## Style Guide
- Background: `#000` black
- Accent: `cyan-400` (#22d3ee) for primary actions
- Secondary: `purple-600` for gradients
- Cards: `bg-zinc-900/80 border border-white/5 rounded-2xl`
- All animations via `motion/react` (framer-motion v12)
- Icons: `lucide-react`

## Free Testing Resources
- **fal.ai**: Sign up at fal.ai → get free credits for new accounts
- **Hailuo direct** (web UI, not API): app.hailuo.ai — 10 free videos/day, no watermark
- **Luma Dream Machine**: lumalabs.ai — 5 free/day, watermark-free
- **PixVerse**: app.pixverse.ai — 3-5 free/day, watermark-free
