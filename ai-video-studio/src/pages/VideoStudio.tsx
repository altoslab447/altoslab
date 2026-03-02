import React, { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Link } from 'react-router-dom'
import {
  Film, Sparkles, Download, ChevronRight, ChevronLeft,
  Settings, FileText, Video, CheckCircle, Loader2,
  Play, AlertCircle, Key, Wand2, Clock, Users,
  Monitor, ExternalLink, RefreshCw, Info, ArrowLeft,
  Clapperboard, Zap, Globe, DollarSign, Copy, RotateCcw,
  ClipboardList,
} from 'lucide-react'
import OpenAI from 'openai'
import { fal } from '@fal-ai/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId = 'config' | 'brief' | 'script' | 'generate' | 'result'
type ContentLang = 'en' | 'zh'

interface VideoModel {
  id: string; label: string; provider: string; badge: string | null
  badgeColor: 'cyan' | 'purple' | 'green'; quality: string; costPerSecond: number
  defaultClipDuration: string; maxDuration: string; note: string
  falTextId: string; falImageId: string; inputFormat: 'hailuo' | 'kling'
}
interface ApiConfig { openaiKey: string; falKey: string; modelId: string; contentLang: ContentLang }
interface BriefData {
  projectName: string; brand: string; targetAudience: string; videoStyle: string
  coreMessage: string; duration: string; aspectRatio: string
  referenceImageUrl: string; additionalNotes: string
}
interface SceneScript {
  sceneNumber: number; title: string; description: string
  narration: string; klingPrompt: string; clipDuration: string
}
interface VideoScript { concept: string; storyline: string; scenes: SceneScript[] }
interface GeneratedClip {
  sceneNumber: number; title: string
  status: 'pending' | 'generating' | 'done' | 'error'
  videoUrl?: string; error?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'hailuo-pro', label: 'Hailuo 02 Pro', provider: 'MiniMax',
    badge: 'Best Value', badgeColor: 'cyan', quality: '1080P',
    costPerSecond: 0.045, defaultClipDuration: '6', maxDuration: '10',
    note: 'Camera control syntax: [Push in] [Dolly out] [Static shot] [Aerial shot]',
    falTextId: 'fal-ai/minimax/hailuo-02/pro/text-to-video',
    falImageId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    inputFormat: 'hailuo',
  },
  {
    id: 'kling-pro', label: 'Kling 2.6 Pro', provider: 'Kuaishou',
    badge: 'Cinematic', badgeColor: 'purple', quality: '1080P',
    costPerSecond: 0.10, defaultClipDuration: '5', maxDuration: '10',
    note: 'Best for cinematic quality, character consistency, and film-grade output',
    falTextId: 'fal-ai/kling-video/v2.6/pro/text-to-video',
    falImageId: 'fal-ai/kling-video/v2.6/pro/image-to-video',
    inputFormat: 'kling',
  },
]

const VIDEO_STYLES = [
  { value: 'corporate', label: 'Corporate Identity', desc: 'Professional & trustworthy',
    keywords: 'cinematic corporate identity film, professional clean aesthetic, premium brand image, 4K quality' },
  { value: 'product', label: 'Product Showcase', desc: 'Detailed & polished',
    keywords: 'commercial product showcase, pristine studio lighting, macro detail shots, premium photography style' },
  { value: 'brand_story', label: 'Brand Story', desc: 'Emotional & narrative',
    keywords: 'emotional brand story documentary, warm cinematic lighting, narrative driven, human connection' },
  { value: 'advertisement', label: 'Image Ad', desc: 'Dynamic & bold',
    keywords: 'high impact commercial advertisement, dynamic energy, bold vibrant colors, fast paced cinematic' },
  { value: 'educational', label: 'Educational', desc: 'Clear & structured',
    keywords: 'professional training video, clean informative style, modern workplace, organized visual flow' },
]

const HAILUO_CAMERA_HINTS = [
  '[Push in]', '[Pull out]', '[Dolly left]', '[Dolly right]',
  '[Pan left]', '[Pan right]', '[Tilt up]', '[Tilt down]',
  '[Static shot]', '[Handheld shot]', '[Aerial shot]',
]

const DEFAULT_BRIEF: BriefData = {
  projectName: '', brand: '', targetAudience: '', videoStyle: 'corporate',
  coreMessage: '', duration: '30', aspectRatio: '16:9',
  referenceImageUrl: '', additionalNotes: '',
}

const STEPS: Array<{ id: StepId; label: string; icon: React.ElementType }> = [
  { id: 'config', label: 'Setup', icon: Settings },
  { id: 'brief', label: 'Brief', icon: FileText },
  { id: 'script', label: 'Script', icon: Clapperboard },
  { id: 'generate', label: 'Generate', icon: Video },
  { id: 'result', label: 'Download', icon: Download },
]

// ─── Prompts & Helpers ────────────────────────────────────────────────────────

function buildSystemPrompt(lang: ContentLang, model: VideoModel): string {
  const cameraNote = model.inputFormat === 'hailuo'
    ? '\n\nFor each klingPrompt, append ONE Hailuo camera command at the end in brackets, e.g.: [Push in], [Pull out], [Static shot], [Aerial shot], [Handheld shot], [Tilt up], [Dolly left].'
    : ''
  const langInstruction = lang === 'en'
    ? 'Write concept, storyline, scene titles, descriptions, and narration entirely in ENGLISH for a global audience.'
    : 'Write concept, storyline, scene titles, descriptions, and narration in TRADITIONAL CHINESE (繁體中文). klingPrompt must always be English.'

  return `You are an expert enterprise video director and AI video prompt engineer specializing in premium corporate marketing films.

${langInstruction}

Create a professional video production script optimized for ${model.label} AI video generation.

Return a JSON object with this EXACT structure:
{
  "concept": "Overall creative concept (2-3 sentences)",
  "storyline": "The narrative arc (2-3 sentences)",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene title",
      "description": "Detailed scene description — what happens, emotions, key visual elements",
      "narration": "Voiceover text (empty string if none)",
      "klingPrompt": "HIGHLY DETAILED English prompt. Include: 1) Subject + action, 2) Camera work (e.g. slow cinematic dolly forward, aerial tracking shot, extreme close-up with rack focus), 3) Lighting (e.g. dramatic golden hour rim lighting, soft diffused studio key light), 4) Color grade (e.g. desaturated teal and orange LUT, warm amber filmic grade), 5) Mood/atmosphere, 6) Technical quality (8K ultra-sharp cinematic, IMAX quality). Write 4-6 detailed sentences.${cameraNote}",
      "clipDuration": "${model.defaultClipDuration}"
    }
  ]
}

Scene count: 15s → 2-3 scenes | 30s → 3-5 scenes | 60s → 5-8 scenes
clipDuration is always "${model.defaultClipDuration}" or "10".`
}

function estimateCost(scenes: SceneScript[], model: VideoModel): number {
  return scenes.reduce((sum, s) => sum + parseFloat(s.clipDuration || model.defaultClipDuration) * model.costPerSecond, 0)
}

function buildFalInput(scene: SceneScript, model: VideoModel, brief: BriefData, useImageMode: boolean): Record<string, unknown> {
  if (model.inputFormat === 'hailuo') {
    const base: Record<string, unknown> = {
      prompt: scene.klingPrompt, prompt_optimizer: true,
      duration: parseInt(scene.clipDuration || model.defaultClipDuration), resolution: '1080P',
    }
    if (useImageMode && brief.referenceImageUrl) base.image_url = brief.referenceImageUrl
    return base
  }
  const base: Record<string, unknown> = {
    prompt: scene.klingPrompt,
    negative_prompt: 'blurry, low quality, distorted, watermark, text overlay, amateur, shaky',
    aspect_ratio: brief.aspectRatio, duration: scene.clipDuration || model.defaultClipDuration,
  }
  if (useImageMode && brief.referenceImageUrl) base.image_url = brief.referenceImageUrl
  return base
}

// ─── Component ────────────────────────────────────────────────────────────────

export const VideoStudio: React.FC = () => {
  const [step, setStep] = useState<StepId>('config')
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    try {
      return {
        openaiKey: localStorage.getItem('avs_openai') || '',
        falKey: localStorage.getItem('avs_fal') || '',
        modelId: localStorage.getItem('avs_model') || VIDEO_MODELS[0].id,
        contentLang: (localStorage.getItem('avs_lang') as ContentLang) || 'en',
      }
    } catch { return { openaiKey: '', falKey: '', modelId: VIDEO_MODELS[0].id, contentLang: 'en' } }
  })
  const [brief, setBrief] = useState<BriefData>(DEFAULT_BRIEF)
  const [script, setScript] = useState<VideoScript | null>(null)
  const [clips, setClips] = useState<GeneratedClip[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [copied, setCopied] = useState(false)

  const stepIndex = STEPS.findIndex(s => s.id === step)
  const selectedModel = VIDEO_MODELS.find(m => m.id === apiConfig.modelId) ?? VIDEO_MODELS[0]

  useEffect(() => {
    try {
      if (apiConfig.openaiKey) localStorage.setItem('avs_openai', apiConfig.openaiKey)
      if (apiConfig.falKey) localStorage.setItem('avs_fal', apiConfig.falKey)
      localStorage.setItem('avs_model', apiConfig.modelId)
      localStorage.setItem('avs_lang', apiConfig.contentLang)
    } catch { /* ignore */ }
  }, [apiConfig])

  const generateScript = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      const openai = new OpenAI({ apiKey: apiConfig.openaiKey, dangerouslyAllowBrowser: true })
      const style = VIDEO_STYLES.find(s => s.value === brief.videoStyle)
      const isEn = apiConfig.contentLang === 'en'
      const userPrompt = isEn
        ? `Create a professional enterprise video script for this brief:\n\n**Project**: ${brief.projectName}\n**Brand**: ${brief.brand}\n**Audience**: ${brief.targetAudience}\n**Style**: ${style?.label} (${style?.keywords})\n**Core Message**: ${brief.coreMessage}\n**Duration**: ${brief.duration}s | **Ratio**: ${brief.aspectRatio}${brief.referenceImageUrl ? `\n**Reference**: ${brief.referenceImageUrl}` : ''}\n**Notes**: ${brief.additionalNotes || 'None'}`
        : `請根據以下簡報製作企業影片腳本：\n\n**專案**: ${brief.projectName}\n**品牌**: ${brief.brand}\n**受眾**: ${brief.targetAudience}\n**風格**: ${style?.label}（${style?.keywords}）\n**核心訊息**: ${brief.coreMessage}\n**時長**: ${brief.duration}s | **比例**: ${brief.aspectRatio}${brief.referenceImageUrl ? `\n**參考圖**: ${brief.referenceImageUrl}` : ''}\n**補充**: ${brief.additionalNotes || '無'}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: buildSystemPrompt(apiConfig.contentLang, selectedModel) },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' }, temperature: 0.8,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) throw new Error('GPT-4o mini returned no content — please retry')
      const parsed = JSON.parse(content) as VideoScript
      if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error('Script format invalid — please retry')
      parsed.scenes = parsed.scenes.map(s => ({ ...s, clipDuration: s.clipDuration || selectedModel.defaultClipDuration }))
      setScript(parsed); setStep('script')
    } catch (err: unknown) {
      setError(`❌ ${err instanceof Error ? err.message : 'Script generation failed'}`)
    } finally { setIsLoading(false) }
  }, [apiConfig, brief, selectedModel])

  const generateVideos = useCallback(async (scenesToGenerate?: SceneScript[]) => {
    if (!script) return
    const scenes = scenesToGenerate ?? script.scenes
    setIsLoading(true); setError(null); setProgress(0)

    if (!scenesToGenerate) {
      setClips(script.scenes.map(s => ({ sceneNumber: s.sceneNumber, title: s.title, status: 'pending' as const })))
      setStep('generate')
    } else {
      setClips(prev => prev.map(c =>
        scenes.find(s => s.sceneNumber === c.sceneNumber)
          ? { ...c, status: 'pending' as const, error: undefined, videoUrl: undefined } : c))
    }

    fal.config({ credentials: apiConfig.falKey })
    let done = 0

    await Promise.all(scenes.map(async scene => {
      setClips(prev => prev.map(c => c.sceneNumber === scene.sceneNumber ? { ...c, status: 'generating' as const } : c))
      try {
        const useImageMode = !!brief.referenceImageUrl && scene.sceneNumber === 1
        const modelFalId = useImageMode ? selectedModel.falImageId : selectedModel.falTextId
        const input = buildFalInput(scene, selectedModel, brief, useImageMode)
        const result = await fal.subscribe(modelFalId, {
          input,
          onQueueUpdate: update => {
            if (update.status === 'IN_PROGRESS') {
              const logs = (update as { logs?: Array<{ message: string }> }).logs
              logs?.forEach(l => console.log('[fal]', l.message))
            }
          },
        })
        const data = result.data as Record<string, unknown>
        const videoUrl = (data?.video as { url?: string })?.url || (data?.video_url as string) || undefined
        setClips(prev => prev.map(c => c.sceneNumber === scene.sceneNumber ? { ...c, status: 'done' as const, videoUrl } : c))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Generation failed'
        setClips(prev => prev.map(c => c.sceneNumber === scene.sceneNumber ? { ...c, status: 'error' as const, error: msg } : c))
      }
      done++; setProgress(Math.round((done / scenes.length) * 100))
    }))

    setStep('result'); setIsLoading(false)
  }, [script, apiConfig.falKey, brief, selectedModel])

  const retryFailed = useCallback(() => {
    if (!script) return
    const failedNums = clips.filter(c => c.status === 'error').map(c => c.sceneNumber)
    const failedScenes = script.scenes.filter(s => failedNums.includes(s.sceneNumber))
    if (!failedScenes.length) return
    setStep('generate'); generateVideos(failedScenes)
  }, [script, clips, generateVideos])

  const exportScript = useCallback(() => {
    if (!script) return
    const text = [
      `# ${brief.projectName}`, '',
      `## Concept`, script.concept, '',
      `## Storyline`, script.storyline, '',
      ...script.scenes.flatMap(s => [
        `---`, `### Scene ${s.sceneNumber}: ${s.title}`,
        `**Description:** ${s.description}`,
        s.narration ? `**Narration:** "${s.narration}"` : '',
        `**Prompt:** ${s.klingPrompt}`,
        `**Duration:** ${s.clipDuration}s`, '',
      ]),
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }, [script, brief.projectName])

  const isConfigValid = apiConfig.openaiKey.trim().length > 10 && apiConfig.falKey.trim().length > 10
  const isBriefValid = brief.projectName.trim() && brief.brand.trim() && brief.targetAudience.trim() && brief.coreMessage.trim()
  const estimatedCost = script ? estimateCost(script.scenes, selectedModel) : 0
  const failedClips = clips.filter(c => c.status === 'error')
  const resetAll = () => { setStep('brief'); setScript(null); setClips([]); setError(null); setProgress(0); setBrief(DEFAULT_BRIEF) }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-white transition-colors text-sm">
            <ArrowLeft size={14} />Home
          </Link>
          <div className="flex items-center gap-2">
            <Film size={18} className="text-cyan-400" />
            <span className="font-bold text-sm">AI Video Studio</span>
          </div>
          <div className="text-xs text-gray-700 hidden sm:block">{selectedModel.label}</div>
        </div>
      </div>

      {/* Step progress */}
      <div className="pt-20 px-6">
        <div className="max-w-3xl mx-auto py-8">
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isActive = s.id === step, isPast = i < stepIndex
              return (
                <React.Fragment key={s.id}>
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isActive ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400' : isPast ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-white/15 text-gray-600'}`}>
                      {isPast ? <CheckCircle size={15} /> : <Icon size={15} />}
                    </div>
                    <span className={`text-[11px] mt-1.5 hidden sm:block whitespace-nowrap ${isActive ? 'text-cyan-400' : isPast ? 'text-emerald-400' : 'text-gray-600'}`}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 transition-colors duration-500 ${i < stepIndex ? 'bg-emerald-400/40' : 'bg-white/8'}`} />}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-24">
        <AnimatePresence mode="wait">

          {/* Step 1: Config */}
          {step === 'config' && (
            <motion.div key="config" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
              <SectionHeader title="Studio Setup" subtitle="Configure API keys, AI model, and content language" />

              <div className="bg-amber-400/8 border border-amber-400/25 rounded-xl p-4 flex gap-3">
                <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80"><strong>Security:</strong> Keys saved only to your browser's localStorage — never sent to any server.</p>
              </div>

              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <IconBadge color="cyan"><Key size={15} /></IconBadge>
                  <div><p className="font-semibold text-white text-sm">OpenAI API Key</p><p className="text-xs text-gray-600">For GPT-4o mini script generation</p></div>
                </div>
                <input type="password" placeholder="sk-proj-..." value={apiConfig.openaiKey}
                  onChange={e => setApiConfig(p => ({ ...p, openaiKey: e.target.value }))} className={inputCls} />
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="mt-2 text-xs text-cyan-500 hover:text-cyan-400 flex items-center gap-1 transition-colors">
                  <ExternalLink size={11} /> Get OpenAI API Key
                </a>
              </Card>

              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <IconBadge color="purple"><Zap size={15} /></IconBadge>
                  <div><p className="font-semibold text-white text-sm">fal.ai API Key</p><p className="text-xs text-gray-600">For AI video generation (Hailuo / Kling)</p></div>
                </div>
                <input type="password" placeholder="fal_key_..." value={apiConfig.falKey}
                  onChange={e => setApiConfig(p => ({ ...p, falKey: e.target.value }))} className={inputCls} />
                <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener noreferrer" className="mt-2 text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1 transition-colors">
                  <ExternalLink size={11} /> Get fal.ai API Key — free credits on signup
                </a>
              </Card>

              <Card>
                <Label>AI Video Model</Label>
                <div className="space-y-2 mt-1">
                  {VIDEO_MODELS.map(m => (
                    <button key={m.id} onClick={() => setApiConfig(p => ({ ...p, modelId: m.id }))}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${apiConfig.modelId === m.id ? 'border-cyan-400 bg-cyan-400/8' : 'border-white/8 hover:border-white/20'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{m.label}</span>
                          <span className="text-xs text-gray-600">by {m.provider}</span>
                          {m.badge && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.badgeColor === 'cyan' ? 'bg-cyan-400/15 text-cyan-400' : 'bg-purple-400/15 text-purple-400'}`}>{m.badge}</span>}
                        </div>
                        <span className="text-xs text-gray-500 font-mono">~${(m.costPerSecond * parseFloat(m.defaultClipDuration)).toFixed(2)}/{m.defaultClipDuration}s</span>
                      </div>
                      <p className="text-xs text-gray-600">{m.note}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-black/30 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-600">
                    <strong className="text-gray-500">Free test (web UI, no API needed):</strong>{' '}
                    <a href="https://app.hailuo.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">Hailuo</a> (10/day) ·{' '}
                    <a href="https://lumalabs.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">Luma</a> (5/day) ·{' '}
                    <a href="https://app.pixverse.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">PixVerse</a> (5/day) — all watermark-free
                  </p>
                </div>
              </Card>

              <Card>
                <Label icon={<Globe size={13} className="text-cyan-400" />}>Script Content Language</Label>
                <div className="flex gap-3 mt-1">
                  {([{ val: 'en' as ContentLang, label: '🇺🇸 English', desc: 'For global / English-speaking audience' }, { val: 'zh' as ContentLang, label: '🇹🇼 繁體中文', desc: '針對中文市場受眾' }] as const).map(opt => (
                    <button key={opt.val} onClick={() => setApiConfig(p => ({ ...p, contentLang: opt.val }))}
                      className={`flex-1 p-3 rounded-xl border text-left transition-all ${apiConfig.contentLang === opt.val ? 'border-cyan-400 bg-cyan-400/8 text-white' : 'border-white/8 text-gray-500 hover:border-white/20'}`}>
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-700 mt-2">Video generation prompts are always in English regardless of this setting.</p>
              </Card>

              <PrimaryButton onClick={() => setStep('brief')} disabled={!isConfigValid}>Continue <ChevronRight size={17} /></PrimaryButton>
            </motion.div>
          )}

          {/* Step 2: Brief */}
          {step === 'brief' && (
            <motion.div key="brief" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
              <SectionHeader title="Video Brief" subtitle="Provide your brand info — AI will craft the script" />

              <Card><Label>Project Name *</Label>
                <input type="text" placeholder="e.g. ALTOSLAB 2026 Brand Film" value={brief.projectName}
                  onChange={e => setBrief(p => ({ ...p, projectName: e.target.value }))} className={inputCls} />
              </Card>

              <Card><Label>Brand / Product Description *</Label>
                <textarea placeholder="Describe your brand, product, or service — core values, unique features, tone, tagline..."
                  value={brief.brand} onChange={e => setBrief(p => ({ ...p, brand: e.target.value }))} rows={4} className={textareaCls} />
              </Card>

              <Card>
                <Label icon={<Users size={13} className="text-cyan-400" />}>Target Audience *</Label>
                <input type="text" placeholder="e.g. Urban professionals 25–45, enterprise decision makers, tech enthusiasts..."
                  value={brief.targetAudience} onChange={e => setBrief(p => ({ ...p, targetAudience: e.target.value }))} className={inputCls} />
              </Card>

              <Card>
                <Label>Video Style</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {VIDEO_STYLES.map(style => (
                    <button key={style.value} onClick={() => setBrief(p => ({ ...p, videoStyle: style.value }))}
                      className={`p-3 rounded-lg border text-left transition-all ${brief.videoStyle === style.value ? 'border-cyan-400 bg-cyan-400/8 text-white' : 'border-white/8 text-gray-500 hover:border-white/20'}`}>
                      <div className="font-medium text-sm">{style.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{style.desc}</div>
                    </button>
                  ))}
                </div>
              </Card>

              <Card><Label>Core Message *</Label>
                <textarea placeholder="What should viewers remember or feel? What action should they take?"
                  value={brief.coreMessage} onChange={e => setBrief(p => ({ ...p, coreMessage: e.target.value }))} rows={3} className={textareaCls} />
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <Label icon={<Clock size={13} className="text-cyan-400" />}>Duration</Label>
                  <div className="flex gap-2 mt-2">
                    {['15', '30', '60'].map(d => (
                      <button key={d} onClick={() => setBrief(p => ({ ...p, duration: d }))}
                        className={`flex-1 py-2 rounded-lg text-sm border transition-all ${brief.duration === d ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400 font-semibold' : 'border-white/8 text-gray-500 hover:border-white/20'}`}>{d}s</button>
                    ))}
                  </div>
                </Card>
                <Card>
                  <Label icon={<Monitor size={13} className="text-cyan-400" />}>Aspect Ratio</Label>
                  <div className="flex gap-2 mt-2">
                    {[{ v: '16:9', l: '16:9' }, { v: '9:16', l: '9:16' }, { v: '1:1', l: '1:1' }].map(ar => (
                      <button key={ar.v} onClick={() => setBrief(p => ({ ...p, aspectRatio: ar.v }))}
                        className={`flex-1 py-2 rounded-lg text-xs border transition-all ${brief.aspectRatio === ar.v ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400 font-semibold' : 'border-white/8 text-gray-500 hover:border-white/20'}`}>{ar.l}</button>
                    ))}
                  </div>
                </Card>
              </div>

              <Card><Label>Reference Image URL (optional)</Label>
                <input type="url" placeholder="https://example.com/brand-image.jpg" value={brief.referenceImageUrl}
                  onChange={e => setBrief(p => ({ ...p, referenceImageUrl: e.target.value }))} className={inputCls + ' font-mono'} />
                <p className="text-xs text-gray-700 mt-2">First scene will auto-switch to image-to-video mode when provided</p>
              </Card>

              <Card><Label>Additional Notes (optional)</Label>
                <textarea placeholder="Style preferences, colors, references to avoid, examples..."
                  value={brief.additionalNotes} onChange={e => setBrief(p => ({ ...p, additionalNotes: e.target.value }))} rows={3} className={textareaCls} />
              </Card>

              {error && <ErrorBox message={error} />}

              <div className="flex gap-3">
                <SecondaryButton onClick={() => setStep('config')}><ChevronLeft size={16} /> Back</SecondaryButton>
                <PrimaryButton onClick={generateScript} disabled={!isBriefValid || isLoading} className="flex-1">
                  {isLoading ? <><Loader2 size={16} className="animate-spin" /> Generating script...</> : <><Wand2 size={16} /> Generate Script</>}
                </PrimaryButton>
              </div>
            </motion.div>
          )}

          {/* Step 3: Script */}
          {step === 'script' && script && (
            <motion.div key="script" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
              <SectionHeader title="Script Review" subtitle="Review and edit the AI-generated script before production" />

              <div className="bg-gradient-to-r from-cyan-400/8 to-purple-600/8 border border-cyan-400/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-cyan-400" />
                    <h3 className="font-bold text-cyan-400 text-sm uppercase tracking-wider">Creative Concept</h3>
                  </div>
                  <button onClick={exportScript} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white border border-white/10 hover:border-white/30 px-3 py-1.5 rounded-lg transition-all">
                    {copied ? <><CheckCircle size={11} className="text-emerald-400" /> Copied!</> : <><Copy size={11} /> Export Script</>}
                  </button>
                </div>
                <p className="text-white text-sm leading-relaxed mb-3">{script.concept}</p>
                <div className="border-t border-white/8 pt-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Storyline</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{script.storyline}</p>
                </div>
              </div>

              <div className="bg-zinc-900/60 border border-white/5 rounded-xl px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <DollarSign size={14} className="text-cyan-400" />Estimated generation cost
                </div>
                <div>
                  <span className="text-white font-mono font-bold">${estimatedCost.toFixed(2)}</span>
                  <span className="text-gray-600 text-xs ml-1">USD · {script.scenes.length} scenes · {selectedModel.label}</span>
                </div>
              </div>

              {selectedModel.inputFormat === 'hailuo' && (
                <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ClipboardList size={11} /> Hailuo Camera Control (append to prompts)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {HAILUO_CAMERA_HINTS.map(hint => (
                      <span key={hint} className="text-xs font-mono bg-black/40 border border-white/8 text-cyan-300/70 px-2 py-0.5 rounded">{hint}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {script.scenes.map((scene, i) => (
                  <Card key={i}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-bold text-xs">{scene.sceneNumber}</div>
                        <h3 className="font-semibold text-white text-sm">{scene.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Duration</span>
                        <div className="flex gap-1">
                          {['5', '6', '10'].map(d => (
                            <button key={d} onClick={() => { const s = [...script.scenes]; s[i] = { ...scene, clipDuration: d }; setScript({ ...script, scenes: s }) }}
                              className={`px-2 py-0.5 rounded text-xs border transition-all ${scene.clipDuration === d ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400' : 'border-white/8 text-gray-600 hover:border-white/20'}`}>{d}s</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Description</p>
                        <p className="text-gray-300 text-sm leading-relaxed">{scene.description}</p>
                      </div>
                      {scene.narration && (
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Narration</p>
                          <p className="text-gray-400 text-sm italic">"{scene.narration}"</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-cyan-600 uppercase tracking-wider mb-1">Video Prompt — editable</p>
                        <textarea value={scene.klingPrompt}
                          onChange={e => { const s = [...script.scenes]; s[i] = { ...scene, klingPrompt: e.target.value }; setScript({ ...script, scenes: s }) }}
                          rows={5} className="w-full bg-black/50 border border-white/8 rounded-lg px-3 py-2.5 text-cyan-200/90 text-xs font-mono leading-relaxed focus:outline-none focus:border-cyan-400/40 resize-none" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex gap-3">
                <SecondaryButton onClick={generateScript} disabled={isLoading}><RefreshCw size={14} /> Regenerate</SecondaryButton>
                <PrimaryButton onClick={() => generateVideos()} disabled={isLoading} className="flex-1">
                  <Play size={16} /> Generate Videos (~${estimatedCost.toFixed(2)})
                </PrimaryButton>
              </div>
            </motion.div>
          )}

          {/* Step 4: Generate */}
          {step === 'generate' && (
            <motion.div key="generate" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
              <SectionHeader title="Generating Videos" subtitle={`${selectedModel.label} is rendering your scenes — ~2–5 min per clip`} />
              <Card>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-gray-400">Overall progress</span>
                  <span className="text-cyan-400 font-mono font-bold">{progress}%</span>
                </div>
                <div className="h-1.5 bg-black rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-cyan-400 to-purple-600 rounded-full"
                    animate={{ width: `${progress}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                </div>
                <p className="text-xs text-gray-700 mt-2 text-center">{clips.filter(c => c.status === 'done').length} / {clips.length} scenes complete</p>
              </Card>
              <div className="space-y-3">
                {clips.map(clip => (
                  <div key={clip.sceneNumber} className="bg-zinc-900/80 border border-white/5 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-gray-500 text-xs font-bold">{clip.sceneNumber}</div>
                        <span className="text-white text-sm font-medium">{clip.title}</span>
                      </div>
                      <ClipStatus status={clip.status} />
                    </div>
                    {clip.status === 'generating' && (
                      <div className="px-4 pb-4">
                        <div className="h-0.5 bg-black rounded-full overflow-hidden">
                          <motion.div className="h-full w-1/3 bg-cyan-400 rounded-full"
                            animate={{ x: ['0%', '300%'] }} transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }} />
                        </div>
                      </div>
                    )}
                    {clip.status === 'done' && clip.videoUrl && <div className="border-t border-white/5"><video src={clip.videoUrl} controls className="w-full bg-black max-h-52" /></div>}
                    {clip.status === 'error' && <div className="px-4 pb-3 text-xs text-red-400">{clip.error}</div>}
                  </div>
                ))}
              </div>
              {error && <ErrorBox message={error} />}
            </motion.div>
          )}

          {/* Step 5: Result */}
          {step === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
              <div className="text-center mb-8">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-14 h-14 bg-emerald-400/15 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={28} className="text-emerald-400" />
                </motion.div>
                <h1 className="text-3xl font-bold mb-1">Production Complete</h1>
                <p className="text-gray-500 text-sm">{brief.projectName} — all scenes processed</p>
              </div>

              <div className="bg-gradient-to-r from-cyan-400/8 to-purple-600/8 border border-white/8 rounded-xl p-5 grid grid-cols-4 text-center divide-x divide-white/5">
                {[{ value: clips.filter(c => c.status === 'done').length, label: 'Done' }, { value: failedClips.length, label: 'Failed' }, { value: `${brief.duration}s`, label: 'Duration' }, { value: brief.aspectRatio, label: 'Ratio' }].map((stat, i) => (
                  <div key={i} className="px-4"><div className="text-2xl font-black text-white">{stat.value}</div><div className="text-xs text-gray-500 mt-0.5">{stat.label}</div></div>
                ))}
              </div>

              {failedClips.length > 0 && (
                <div className="bg-red-400/8 border border-red-400/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-red-300">
                    <AlertCircle size={14} />{failedClips.length} scene{failedClips.length > 1 ? 's' : ''} failed
                  </div>
                  <button onClick={retryFailed} className="flex items-center gap-1.5 bg-red-400/15 hover:bg-red-400/25 border border-red-400/30 text-red-400 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    <RotateCcw size={12} /> Retry Failed
                  </button>
                </div>
              )}

              <div className="space-y-5">
                {clips.map(clip => (
                  <div key={clip.sceneNumber} className="bg-zinc-900/80 border border-white/5 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-cyan-400/15 flex items-center justify-center text-cyan-400 text-xs font-bold">{clip.sceneNumber}</div>
                        <span className="font-semibold text-white text-sm">{clip.title}</span>
                      </div>
                      {clip.status === 'done' && clip.videoUrl && (
                        <a href={clip.videoUrl} download={`scene-${clip.sceneNumber}.mp4`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/30 text-cyan-400 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
                          <Download size={12} /> Download
                        </a>
                      )}
                    </div>
                    {clip.status === 'done' && clip.videoUrl
                      ? <video src={clip.videoUrl} controls className="w-full bg-black" style={{ maxHeight: 400 }} />
                      : clip.status === 'error'
                      ? <div className="p-4 flex items-center gap-2 text-red-400 text-sm"><AlertCircle size={14} />{clip.error || 'Failed'}</div>
                      : <div className="p-4 text-gray-600 text-sm">Not generated</div>}
                  </div>
                ))}
              </div>

              <SecondaryButton onClick={resetAll} className="w-full justify-center"><RefreshCw size={14} /> Start New Project</SecondaryButton>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="text-center mb-8">
    <h1 className="text-3xl font-bold mb-2">{title}</h1>
    <p className="text-gray-500 text-sm">{subtitle}</p>
  </div>
)

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-zinc-900/80 border border-white/5 rounded-2xl p-5 ${className}`}>{children}</div>
)

const Label = ({ children, icon, className = '' }: { children: React.ReactNode; icon?: React.ReactNode; className?: string }) => (
  <label className={`block text-sm font-medium text-gray-400 mb-2 flex items-center gap-1.5 ${className}`}>{icon}{children}</label>
)

const IconBadge = ({ children, color }: { children: React.ReactNode; color: 'cyan' | 'purple' }) => (
  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color === 'cyan' ? 'bg-cyan-400/15 text-cyan-400' : 'bg-purple-400/15 text-purple-400'}`}>{children}</div>
)

const inputCls = 'w-full bg-black border border-white/8 rounded-lg px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-cyan-400/40 text-sm'
const textareaCls = 'w-full bg-black border border-white/8 rounded-lg px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-cyan-400/40 resize-none text-sm'

const PrimaryButton = ({ children, onClick, disabled = false, className = '' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) => (
  <button onClick={onClick} disabled={disabled}
    className={`flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold py-3.5 px-6 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed ${className}`}>
    {children}
  </button>
)

const SecondaryButton = ({ children, onClick, disabled = false, className = '' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) => (
  <button onClick={onClick} disabled={disabled}
    className={`flex items-center gap-2 bg-white/4 border border-white/8 text-gray-300 font-medium py-3.5 px-5 rounded-xl hover:bg-white/8 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed ${className}`}>
    {children}
  </button>
)

const ErrorBox = ({ message }: { message: string }) => (
  <div className="bg-red-400/8 border border-red-400/25 rounded-xl p-4 flex gap-3">
    <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
    <p className="text-sm text-red-300">{message}</p>
  </div>
)

const ClipStatus = ({ status }: { status: GeneratedClip['status'] }) => {
  if (status === 'pending') return <span className="text-xs text-gray-600 flex items-center gap-1"><Clock size={11} /> Waiting</span>
  if (status === 'generating') return <span className="text-xs text-cyan-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Rendering</span>
  if (status === 'done') return <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> Done</span>
  return <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={11} /> Failed</span>
}
