import React, { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Link } from 'react-router-dom'
import {
  Film, Sparkles, Download, ChevronRight, ChevronLeft,
  Settings, FileText, Video, CheckCircle, Loader2,
  Play, AlertCircle, Key, Wand2, Clock, Users,
  Monitor, ExternalLink, RefreshCw, Info, ArrowLeft,
  Clapperboard, Zap,
} from 'lucide-react'
import OpenAI from 'openai'
import { fal } from '@fal-ai/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId = 'config' | 'brief' | 'script' | 'generate' | 'result'

interface ApiConfig {
  openaiKey: string
  falKey: string
  klingModel: string
}

interface BriefData {
  projectName: string
  brand: string
  targetAudience: string
  videoStyle: string
  coreMessage: string
  duration: string
  aspectRatio: string
  referenceImageUrl: string
  additionalNotes: string
}

interface SceneScript {
  sceneNumber: number
  title: string
  description: string
  narration: string
  klingPrompt: string
  clipDuration: string
}

interface VideoScript {
  concept: string
  storyline: string
  scenes: SceneScript[]
}

interface GeneratedClip {
  sceneNumber: number
  title: string
  status: 'pending' | 'generating' | 'done' | 'error'
  videoUrl?: string
  error?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS: Array<{ id: StepId; label: string; icon: React.ElementType }> = [
  { id: 'config', label: 'API 設定', icon: Settings },
  { id: 'brief', label: '影片簡報', icon: FileText },
  { id: 'script', label: '腳本審閱', icon: Clapperboard },
  { id: 'generate', label: '影片生成', icon: Video },
  { id: 'result', label: '成品下載', icon: Download },
]

const VIDEO_STYLES = [
  {
    value: 'corporate',
    label: '企業形象',
    desc: '專業、沉穩、信任感',
    keywords: 'cinematic corporate identity film, professional clean aesthetic, premium brand image, 4K quality, prestigious',
  },
  {
    value: 'product',
    label: '產品展示',
    desc: '精緻、細節突出',
    keywords: 'commercial product showcase, pristine studio lighting, macro detail shots, premium product photography style',
  },
  {
    value: 'brand_story',
    label: '品牌故事',
    desc: '情感、敘事、引人入勝',
    keywords: 'emotional brand story documentary, warm cinematic lighting, narrative driven, human connection, heartfelt',
  },
  {
    value: 'advertisement',
    label: '形象廣告',
    desc: '動感、大膽、震撼',
    keywords: 'high impact commercial advertisement, dynamic energy, bold vibrant colors, fast paced cinematic cuts',
  },
  {
    value: 'educational',
    label: '教育培訓',
    desc: '清晰、有條理',
    keywords: 'professional corporate training video, clean informative style, modern workplace, organized visual flow',
  },
]

const KLING_MODELS = [
  { value: 'fal-ai/kling-video/v2.6/pro/text-to-video', label: 'Kling 2.6 Pro (推薦)', desc: '穩定、高品質、文件完整' },
  { value: 'fal-ai/kling-video/v2.1/master/text-to-video', label: 'Kling 2.1 Master', desc: '細節豐富、電影質感強' },
]

const DEFAULT_BRIEF: BriefData = {
  projectName: '',
  brand: '',
  targetAudience: '',
  videoStyle: 'corporate',
  coreMessage: '',
  duration: '30',
  aspectRatio: '16:9',
  referenceImageUrl: '',
  additionalNotes: '',
}

const SYSTEM_PROMPT = `You are an expert enterprise video director and AI video prompt engineer specializing in corporate marketing films.

Create a professional video production script optimized for Kling AI video generation.

Return a JSON object with this EXACT structure:
{
  "concept": "Overall creative concept in Chinese (2-3 sentences)",
  "storyline": "The narrative arc in Chinese (2-3 sentences)",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene title in Chinese",
      "description": "Detailed scene description in Chinese - what happens, emotions, visual elements",
      "narration": "Voiceover narration in Chinese (empty string if none)",
      "klingPrompt": "HIGHLY DETAILED English prompt for Kling AI. Must include: 1) Subject + action (who/what and what they're doing), 2) Camera work (e.g. 'slow cinematic dolly forward', 'aerial tracking shot', 'extreme close-up with rack focus to medium shot'), 3) Lighting setup (e.g. 'dramatic golden hour rim lighting', 'soft diffused studio key light with blue fill', 'high-contrast chiaroscuro'), 4) Color grade (e.g. 'desaturated cool teal and orange', 'warm amber filmic grade', 'clean bright commercial look'), 5) Mood and atmosphere, 6) Technical quality ('8K ultra-sharp cinematic', '4K film grain texture', 'IMAX quality'). Write 4-6 sentences minimum.",
      "clipDuration": "5"
    }
  ]
}

Scene count by duration:
- 15 seconds: 2-3 scenes
- 30 seconds: 3-5 scenes
- 60 seconds: 5-8 scenes

Each klingPrompt must be premium, cinematic, enterprise-grade. Include brand-relevant visuals, premium materials, corporate environments. clipDuration is always "5" or "10".`

// ─── Component ────────────────────────────────────────────────────────────────

export const VideoStudio: React.FC = () => {
  const [step, setStep] = useState<StepId>('config')
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    try {
      return {
        openaiKey: localStorage.getItem('avs_openai') || '',
        falKey: localStorage.getItem('avs_fal') || '',
        klingModel: localStorage.getItem('avs_model') || KLING_MODELS[0].value,
      }
    } catch {
      return { openaiKey: '', falKey: '', klingModel: KLING_MODELS[0].value }
    }
  })
  const [brief, setBrief] = useState<BriefData>(DEFAULT_BRIEF)
  const [script, setScript] = useState<VideoScript | null>(null)
  const [clips, setClips] = useState<GeneratedClip[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const stepIndex = STEPS.findIndex(s => s.id === step)

  // Persist API config
  useEffect(() => {
    try {
      if (apiConfig.openaiKey) localStorage.setItem('avs_openai', apiConfig.openaiKey)
      if (apiConfig.falKey) localStorage.setItem('avs_fal', apiConfig.falKey)
      localStorage.setItem('avs_model', apiConfig.klingModel)
    } catch { /* ignore */ }
  }, [apiConfig])

  // ── Script Generation ───────────────────────────────────────────────────────

  const generateScript = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const openai = new OpenAI({
        apiKey: apiConfig.openaiKey,
        dangerouslyAllowBrowser: true,
      })

      const style = VIDEO_STYLES.find(s => s.value === brief.videoStyle)

      const userPrompt = `請根據以下資訊製作企業影片腳本：

**專案名稱**: ${brief.projectName}
**品牌 / 產品描述**: ${brief.brand}
**目標受眾**: ${brief.targetAudience}
**影片風格**: ${style?.label}（${style?.keywords}）
**核心訊息**: ${brief.coreMessage}
**影片時長**: ${brief.duration} 秒
**畫面比例**: ${brief.aspectRatio}${brief.referenceImageUrl ? `\n**參考視覺**: ${brief.referenceImageUrl}` : ''}
**補充說明**: ${brief.additionalNotes || '無'}

請依照要求輸出完整 JSON 腳本。`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) throw new Error('GPT-4o mini 沒有回傳內容，請重試')

      const parsed = JSON.parse(content) as VideoScript
      if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        throw new Error('腳本格式異常，請重試')
      }

      setScript(parsed)
      setStep('script')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '腳本生成失敗'
      setError(`❌ ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }, [apiConfig.openaiKey, brief])

  // ── Video Generation ────────────────────────────────────────────────────────

  const generateVideos = useCallback(async () => {
    if (!script) return

    setIsLoading(true)
    setError(null)
    setProgress(0)

    const initialClips: GeneratedClip[] = script.scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      status: 'pending',
    }))
    setClips(initialClips)
    setStep('generate')

    fal.config({ credentials: apiConfig.falKey })

    let done = 0

    await Promise.all(
      script.scenes.map(async scene => {
        setClips(prev =>
          prev.map(c =>
            c.sceneNumber === scene.sceneNumber ? { ...c, status: 'generating' } : c
          )
        )

        try {
          // Use image-to-video for first scene if reference image provided
          const useImageModel =
            brief.referenceImageUrl && scene.sceneNumber === 1
          const modelId = useImageModel
            ? apiConfig.klingModel.replace('text-to-video', 'image-to-video')
            : apiConfig.klingModel

          const input: Record<string, unknown> = {
            prompt: scene.klingPrompt,
            negative_prompt:
              'blurry, low quality, distorted, watermark, text overlay, amateur, shaky, overexposed, underexposed',
            aspect_ratio: brief.aspectRatio,
            duration: scene.clipDuration || '5',
          }

          if (useImageModel && brief.referenceImageUrl) {
            input.image_url = brief.referenceImageUrl
          }

          const result = await fal.subscribe(modelId, {
            input,
            onQueueUpdate: update => {
              if (update.status === 'IN_PROGRESS') {
                const logs = (update as { logs?: Array<{ message: string }> }).logs
                logs?.forEach(l => console.log('[fal]', l.message))
              }
            },
          })

          const data = result.data as Record<string, unknown>
          const videoUrl =
            (data?.video as { url?: string })?.url ||
            (data?.video_url as string) ||
            undefined

          setClips(prev =>
            prev.map(c =>
              c.sceneNumber === scene.sceneNumber
                ? { ...c, status: 'done', videoUrl }
                : c
            )
          )
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : '生成失敗'
          setClips(prev =>
            prev.map(c =>
              c.sceneNumber === scene.sceneNumber
                ? { ...c, status: 'error', error: msg }
                : c
            )
          )
        }

        done++
        setProgress(Math.round((done / script.scenes.length) * 100))
      })
    )

    setStep('result')
    setIsLoading(false)
  }, [script, apiConfig, brief])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const isConfigValid =
    apiConfig.openaiKey.trim().length > 10 && apiConfig.falKey.trim().length > 10

  const isBriefValid =
    brief.projectName.trim() &&
    brief.brand.trim() &&
    brief.targetAudience.trim() &&
    brief.coreMessage.trim()

  const resetAll = () => {
    setStep('brief')
    setScript(null)
    setClips([])
    setError(null)
    setProgress(0)
    setBrief(DEFAULT_BRIEF)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft size={14} />
            返回首頁
          </Link>
          <div className="flex items-center gap-2">
            <Film size={18} className="text-cyan-400" />
            <span className="font-bold text-sm tracking-tight">AI 影片工作室</span>
          </div>
          <div className="text-xs text-gray-700 hidden sm:block">
            GPT-4o mini · Kling 2.6 Pro
          </div>
        </div>
      </div>

      {/* Step progress */}
      <div className="pt-20 px-6">
        <div className="max-w-3xl mx-auto py-8">
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isActive = s.id === step
              const isPast = i < stepIndex
              return (
                <React.Fragment key={s.id}>
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                        isActive
                          ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400'
                          : isPast
                          ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400'
                          : 'border-white/15 text-gray-600'
                      }`}
                    >
                      {isPast ? <CheckCircle size={15} /> : <Icon size={15} />}
                    </div>
                    <span
                      className={`text-[11px] mt-1.5 hidden sm:block whitespace-nowrap ${
                        isActive
                          ? 'text-cyan-400'
                          : isPast
                          ? 'text-emerald-400'
                          : 'text-gray-600'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-px mx-2 transition-colors duration-500 ${
                        i < stepIndex ? 'bg-emerald-400/40' : 'bg-white/8'
                      }`}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-6 pb-24">
        <AnimatePresence mode="wait">

          {/* ── Step 1: Config ─────────────────────────────────────────────── */}
          {step === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-5"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">API 金鑰設定</h1>
                <p className="text-gray-500 text-sm">請輸入 API 金鑰，金鑰僅儲存在您的瀏覽器本地</p>
              </div>

              <div className="bg-amber-400/8 border border-amber-400/25 rounded-xl p-4 flex gap-3">
                <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80">
                  <strong>安全提示：</strong>金鑰儲存在 localStorage，僅在此瀏覽器使用，
                  不會傳送至任何第三方伺服器。此工具僅供個人或企業內部使用。
                </p>
              </div>

              {/* OpenAI Key */}
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <IconBadge color="cyan"><Key size={15} /></IconBadge>
                  <div>
                    <p className="font-semibold text-white text-sm">OpenAI API Key</p>
                    <p className="text-xs text-gray-600">用於 GPT-4o mini 腳本生成與分析</p>
                  </div>
                </div>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={apiConfig.openaiKey}
                  onChange={e => setApiConfig(p => ({ ...p, openaiKey: e.target.value }))}
                  className="w-full bg-black border border-white/8 rounded-lg px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-cyan-400/50 font-mono text-sm"
                />
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-xs text-cyan-500 hover:text-cyan-400 flex items-center gap-1 transition-colors"
                >
                  <ExternalLink size={11} /> 取得 OpenAI API Key
                </a>
              </Card>

              {/* fal.ai Key */}
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <IconBadge color="purple"><Zap size={15} /></IconBadge>
                  <div>
                    <p className="font-semibold text-white text-sm">fal.ai API Key</p>
                    <p className="text-xs text-gray-600">用於 Kling AI 影片生成</p>
                  </div>
                </div>
                <input
                  type="password"
                  placeholder="fal_key_..."
                  value={apiConfig.falKey}
                  onChange={e => setApiConfig(p => ({ ...p, falKey: e.target.value }))}
                  className="w-full bg-black border border-white/8 rounded-lg px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-purple-400/50 font-mono text-sm"
                />
                <a
                  href="https://fal.ai/dashboard/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1 transition-colors"
                >
                  <ExternalLink size={11} /> 取得 fal.ai API Key
                </a>
              </Card>

              {/* Model selection */}
              <Card>
                <p className="text-sm font-medium text-gray-300 mb-3">Kling 模型選擇</p>
                <div className="space-y-2">
                  {KLING_MODELS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => setApiConfig(p => ({ ...p, klingModel: m.value }))}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        apiConfig.klingModel === m.value
                          ? 'border-cyan-400 bg-cyan-400/8 text-white'
                          : 'border-white/8 text-gray-500 hover:border-white/20'
                      }`}
                    >
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </Card>

              <PrimaryButton
                onClick={() => setStep('brief')}
                disabled={!isConfigValid}
              >
                繼續
                <ChevronRight size={17} />
              </PrimaryButton>
            </motion.div>
          )}

          {/* ── Step 2: Brief ──────────────────────────────────────────────── */}
          {step === 'brief' && (
            <motion.div
              key="brief"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-5"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">影片簡報</h1>
                <p className="text-gray-500 text-sm">提供品牌資訊，AI 將為您量身打造腳本</p>
              </div>

              {/* Project name */}
              <Card>
                <Label>專案名稱 *</Label>
                <input
                  type="text"
                  placeholder="例：ALTOSLAB 2026 品牌形象影片"
                  value={brief.projectName}
                  onChange={e => setBrief(p => ({ ...p, projectName: e.target.value }))}
                  className={inputCls}
                />
              </Card>

              {/* Brand description */}
              <Card>
                <Label>品牌 / 產品描述 *</Label>
                <textarea
                  placeholder="描述您的品牌、產品或服務，包含核心價值、特色、風格、口號..."
                  value={brief.brand}
                  onChange={e => setBrief(p => ({ ...p, brand: e.target.value }))}
                  rows={4}
                  className={textareaCls}
                />
              </Card>

              {/* Target audience */}
              <Card>
                <Label icon={<Users size={13} className="text-cyan-400" />}>目標受眾 *</Label>
                <input
                  type="text"
                  placeholder="例：25-45 歲都市專業人士、企業決策者、科技愛好者..."
                  value={brief.targetAudience}
                  onChange={e => setBrief(p => ({ ...p, targetAudience: e.target.value }))}
                  className={inputCls}
                />
              </Card>

              {/* Video style */}
              <Card>
                <Label>影片風格</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {VIDEO_STYLES.map(style => (
                    <button
                      key={style.value}
                      onClick={() => setBrief(p => ({ ...p, videoStyle: style.value }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        brief.videoStyle === style.value
                          ? 'border-cyan-400 bg-cyan-400/8 text-white'
                          : 'border-white/8 text-gray-500 hover:border-white/20'
                      }`}
                    >
                      <div className="font-medium text-sm">{style.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{style.desc}</div>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Core message */}
              <Card>
                <Label>核心訊息 *</Label>
                <textarea
                  placeholder="您希望觀眾看完影片後，記住什麼？感受到什麼？有什麼行動？"
                  value={brief.coreMessage}
                  onChange={e => setBrief(p => ({ ...p, coreMessage: e.target.value }))}
                  rows={3}
                  className={textareaCls}
                />
              </Card>

              {/* Duration & aspect ratio */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <Label icon={<Clock size={13} className="text-cyan-400" />}>影片時長</Label>
                  <div className="flex gap-2 mt-2">
                    {['15', '30', '60'].map(d => (
                      <button
                        key={d}
                        onClick={() => setBrief(p => ({ ...p, duration: d }))}
                        className={`flex-1 py-2 rounded-lg text-sm border transition-all ${
                          brief.duration === d
                            ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400 font-semibold'
                            : 'border-white/8 text-gray-500 hover:border-white/20'
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </Card>

                <Card>
                  <Label icon={<Monitor size={13} className="text-cyan-400" />}>畫面比例</Label>
                  <div className="flex gap-2 mt-2">
                    {[
                      { v: '16:9', l: '橫' },
                      { v: '9:16', l: '直' },
                      { v: '1:1', l: '方' },
                    ].map(ar => (
                      <button
                        key={ar.v}
                        onClick={() => setBrief(p => ({ ...p, aspectRatio: ar.v }))}
                        className={`flex-1 py-2 rounded-lg text-xs border transition-all flex flex-col items-center gap-0.5 ${
                          brief.aspectRatio === ar.v
                            ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400 font-semibold'
                            : 'border-white/8 text-gray-500 hover:border-white/20'
                        }`}
                      >
                        <span className="font-medium">{ar.l}</span>
                        <span className="opacity-60">{ar.v}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Reference image */}
              <Card>
                <Label>參考圖片 URL（選填）</Label>
                <input
                  type="url"
                  placeholder="https://example.com/brand-image.jpg"
                  value={brief.referenceImageUrl}
                  onChange={e => setBrief(p => ({ ...p, referenceImageUrl: e.target.value }))}
                  className={inputCls + ' font-mono'}
                />
                <p className="text-xs text-gray-700 mt-2">
                  提供品牌圖片，第一個場景將使用 Image-to-Video 模式生成
                </p>
              </Card>

              {/* Additional notes */}
              <Card>
                <Label>補充說明（選填）</Label>
                <textarea
                  placeholder="任何其他需求：風格偏好、顏色、避免事項、參考影片風格..."
                  value={brief.additionalNotes}
                  onChange={e => setBrief(p => ({ ...p, additionalNotes: e.target.value }))}
                  rows={3}
                  className={textareaCls}
                />
              </Card>

              {error && <ErrorBox message={error} />}

              <div className="flex gap-3">
                <SecondaryButton onClick={() => setStep('config')}>
                  <ChevronLeft size={16} />
                  返回
                </SecondaryButton>
                <PrimaryButton
                  onClick={generateScript}
                  disabled={!isBriefValid || isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      AI 正在撰寫腳本...
                    </>
                  ) : (
                    <>
                      <Wand2 size={16} />
                      AI 生成腳本
                    </>
                  )}
                </PrimaryButton>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Script Review ──────────────────────────────────────── */}
          {step === 'script' && script && (
            <motion.div
              key="script"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-5"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">腳本審閱</h1>
                <p className="text-gray-500 text-sm">確認腳本內容，可編輯各場景的 Kling 提示詞</p>
              </div>

              {/* Concept card */}
              <div className="bg-gradient-to-r from-cyan-400/8 to-purple-600/8 border border-cyan-400/20 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={16} className="text-cyan-400" />
                  <h3 className="font-bold text-cyan-400 text-sm uppercase tracking-wider">影片概念</h3>
                </div>
                <p className="text-white text-sm leading-relaxed mb-3">{script.concept}</p>
                <div className="border-t border-white/8 pt-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">故事線</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{script.storyline}</p>
                </div>
              </div>

              {/* Scenes */}
              <div className="space-y-4">
                {script.scenes.map((scene, i) => (
                  <Card key={i}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
                          {scene.sceneNumber}
                        </div>
                        <h3 className="font-semibold text-white text-sm">{scene.title}</h3>
                      </div>
                      <span className="text-xs text-gray-600 bg-black/40 px-2 py-1 rounded-full border border-white/8">
                        {scene.clipDuration}s
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">場景描述</p>
                        <p className="text-gray-300 text-sm leading-relaxed">{scene.description}</p>
                      </div>

                      {scene.narration && (
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">旁白</p>
                          <p className="text-gray-400 text-sm italic">「{scene.narration}」</p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-cyan-600 uppercase tracking-wider mb-1">
                          Kling 提示詞（可編輯）
                        </p>
                        <textarea
                          value={scene.klingPrompt}
                          onChange={e => {
                            const newScenes = [...script.scenes]
                            newScenes[i] = { ...scene, klingPrompt: e.target.value }
                            setScript({ ...script, scenes: newScenes })
                          }}
                          rows={5}
                          className="w-full bg-black/50 border border-white/8 rounded-lg px-3 py-2.5 text-cyan-200/90 text-xs font-mono leading-relaxed focus:outline-none focus:border-cyan-400/40 resize-none"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Label className="text-xs">場景時長</Label>
                        <div className="flex gap-1">
                          {['5', '10'].map(d => (
                            <button
                              key={d}
                              onClick={() => {
                                const newScenes = [...script.scenes]
                                newScenes[i] = { ...scene, clipDuration: d }
                                setScript({ ...script, scenes: newScenes })
                              }}
                              className={`px-3 py-1 rounded text-xs border transition-all ${
                                scene.clipDuration === d
                                  ? 'border-cyan-400 bg-cyan-400/15 text-cyan-400'
                                  : 'border-white/8 text-gray-600 hover:border-white/20'
                              }`}
                            >
                              {d}秒
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex gap-3">
                <SecondaryButton onClick={generateScript} disabled={isLoading}>
                  <RefreshCw size={14} />
                  重新生成
                </SecondaryButton>
                <PrimaryButton onClick={generateVideos} disabled={isLoading} className="flex-1">
                  <Play size={16} />
                  開始生成影片
                </PrimaryButton>
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Generate ───────────────────────────────────────────── */}
          {step === 'generate' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-5"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">影片生成中</h1>
                <p className="text-gray-500 text-sm">
                  Kling AI 正在為您生成高品質影片，每個場景約 2-5 分鐘
                </p>
              </div>

              {/* Overall progress */}
              <Card>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-gray-400">整體進度</span>
                  <span className="text-cyan-400 font-mono font-bold">{progress}%</span>
                </div>
                <div className="h-1.5 bg-black rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-400 to-purple-600 rounded-full"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-xs text-gray-700 mt-2 text-center">
                  {clips.filter(c => c.status === 'done').length} / {clips.length} 場景完成
                </p>
              </Card>

              {/* Clip list */}
              <div className="space-y-3">
                {clips.map(clip => (
                  <div
                    key={clip.sceneNumber}
                    className="bg-zinc-900/80 border border-white/5 rounded-xl overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-gray-500 text-xs font-bold">
                          {clip.sceneNumber}
                        </div>
                        <span className="text-white text-sm font-medium">{clip.title}</span>
                      </div>
                      <ClipStatus status={clip.status} />
                    </div>

                    {clip.status === 'generating' && (
                      <div className="px-4 pb-4">
                        <div className="h-0.5 bg-black rounded-full overflow-hidden">
                          <motion.div
                            className="h-full w-1/3 bg-cyan-400 rounded-full"
                            animate={{ x: ['0%', '300%'] }}
                            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                          />
                        </div>
                      </div>
                    )}

                    {clip.status === 'done' && clip.videoUrl && (
                      <div className="border-t border-white/5">
                        <video
                          src={clip.videoUrl}
                          controls
                          className="w-full bg-black max-h-52"
                        />
                      </div>
                    )}

                    {clip.status === 'error' && (
                      <div className="px-4 pb-3 text-xs text-red-400">{clip.error}</div>
                    )}
                  </div>
                ))}
              </div>

              {error && <ErrorBox message={error} />}
            </motion.div>
          )}

          {/* ── Step 5: Result ─────────────────────────────────────────────── */}
          {step === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-5"
            >
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-14 h-14 bg-emerald-400/15 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle size={28} className="text-emerald-400" />
                </motion.div>
                <h1 className="text-3xl font-bold mb-1">影片生成完成！</h1>
                <p className="text-gray-500 text-sm">{brief.projectName} — 所有場景已生成</p>
              </div>

              {/* Summary */}
              <div className="bg-gradient-to-r from-cyan-400/8 to-purple-600/8 border border-white/8 rounded-xl p-5 flex items-center justify-around text-center">
                {[
                  { value: clips.filter(c => c.status === 'done').length, label: '成功場景' },
                  { value: clips.filter(c => c.status === 'error').length, label: '失敗場景' },
                  { value: `${brief.duration}s`, label: '目標時長' },
                  { value: brief.aspectRatio, label: '畫面比例' },
                ].map((stat, i) => (
                  <div key={i}>
                    <div className="text-2xl font-black text-white">{stat.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Video clips */}
              <div className="space-y-5">
                {clips.map(clip => (
                  <div
                    key={clip.sceneNumber}
                    className="bg-zinc-900/80 border border-white/5 rounded-2xl overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-cyan-400/15 flex items-center justify-center text-cyan-400 text-xs font-bold">
                          {clip.sceneNumber}
                        </div>
                        <span className="font-semibold text-white text-sm">{clip.title}</span>
                      </div>
                      {clip.status === 'done' && clip.videoUrl && (
                        <a
                          href={clip.videoUrl}
                          download={`scene-${clip.sceneNumber}.mp4`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/30 text-cyan-400 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Download size={12} />
                          下載
                        </a>
                      )}
                    </div>

                    {clip.status === 'done' && clip.videoUrl ? (
                      <video
                        src={clip.videoUrl}
                        controls
                        className="w-full bg-black"
                        style={{ maxHeight: 400 }}
                      />
                    ) : clip.status === 'error' ? (
                      <div className="p-4 flex items-center gap-2 text-red-400 text-sm">
                        <AlertCircle size={14} />
                        {clip.error || '生成失敗'}
                      </div>
                    ) : (
                      <div className="p-4 text-gray-600 text-sm">未生成</div>
                    )}
                  </div>
                ))}
              </div>

              <SecondaryButton onClick={resetAll} className="w-full justify-center">
                <RefreshCw size={14} />
                製作新影片
              </SecondaryButton>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Small shared components ──────────────────────────────────────────────────

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-zinc-900/80 border border-white/5 rounded-2xl p-5 ${className}`}>
    {children}
  </div>
)

const Label = ({
  children,
  icon,
  className = '',
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) => (
  <label className={`block text-sm font-medium text-gray-400 mb-2 flex items-center gap-1.5 ${className}`}>
    {icon}
    {children}
  </label>
)

const IconBadge = ({
  children,
  color,
}: {
  children: React.ReactNode
  color: 'cyan' | 'purple'
}) => (
  <div
    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
      color === 'cyan' ? 'bg-cyan-400/15 text-cyan-400' : 'bg-purple-400/15 text-purple-400'
    }`}
  >
    {children}
  </div>
)

const inputCls =
  'w-full bg-black border border-white/8 rounded-lg px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-cyan-400/40 text-sm'

const textareaCls =
  'w-full bg-black border border-white/8 rounded-lg px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-cyan-400/40 resize-none text-sm'

const PrimaryButton = ({
  children,
  onClick,
  disabled = false,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold py-3.5 px-6 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
)

const SecondaryButton = ({
  children,
  onClick,
  disabled = false,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 bg-white/4 border border-white/8 text-gray-300 font-medium py-3.5 px-5 rounded-xl hover:bg-white/8 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
  >
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
  if (status === 'pending')
    return <span className="text-xs text-gray-600 flex items-center gap-1"><Clock size={11} /> 等待中</span>
  if (status === 'generating')
    return <span className="text-xs text-cyan-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> 生成中</span>
  if (status === 'done')
    return <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> 完成</span>
  return <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={11} /> 失敗</span>
}
