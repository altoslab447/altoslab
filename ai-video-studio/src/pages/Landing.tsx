import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import {
  Film, Sparkles, Wand2, Download, ArrowRight,
  CheckCircle, Zap, Users, Monitor
} from 'lucide-react'

const FEATURES = [
  {
    icon: Wand2,
    title: 'AI 智慧腳本',
    desc: 'GPT-4o mini 分析您的品牌與訴求，自動生成專業的分鏡腳本與旁白',
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
  },
  {
    icon: Film,
    title: 'Kling 影片生成',
    desc: '調用最新 Kling 2.6 Pro，支援 1080p 高品質、多鏡頭、原生音效',
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
  },
  {
    icon: Download,
    title: '立即下載',
    desc: '生成完成即可下載高品質 MP4，支援橫版、直版、方形等多種比例',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
  },
]

const WORKFLOW = [
  { step: '01', title: '提供素材與方向', desc: '填寫品牌描述、目標受眾、影片風格與核心訊息' },
  { step: '02', title: 'AI 撰寫腳本', desc: 'GPT-4o mini 自動分析並生成完整分鏡腳本與 Kling 提示詞' },
  { step: '03', title: '審閱並調整', desc: '檢視腳本，可手動微調每個場景的提示詞' },
  { step: '04', title: 'AI 生成影片', desc: 'Kling 2.6 Pro 同步生成所有場景，完成後即可下載' },
]

const SUPPORTED_TYPES = [
  '企業形象影片', '產品發表影片', '品牌故事片', '形象廣告',
  '教育培訓影片', '活動紀錄片',
]

export const Landing = () => {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film size={20} className="text-cyan-400" />
            <span className="font-bold text-white tracking-tight">AI Video Studio</span>
          </div>
          <Link
            to="/studio"
            className="flex items-center gap-2 bg-cyan-400 text-black font-bold text-sm px-5 py-2 rounded-full hover:bg-cyan-300 transition-colors"
          >
            <Sparkles size={14} />
            開始製作
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/10 via-black to-black" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-sm px-4 py-2 rounded-full mb-8">
              <Zap size={14} />
              Powered by GPT-4o mini + Kling 2.6 Pro
            </div>

            <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
              企業級
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
                AI 影片生成工作室
              </span>
            </h1>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              提供品牌方向，AI 幫你分析、寫腳本、生成影片。
              從簡報到成品，全流程自動化，分鐘級交付企業形象影片。
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/studio"
                className="inline-flex items-center gap-3 bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold px-8 py-4 rounded-full text-lg hover:opacity-90 transition-opacity"
              >
                <Sparkles size={20} />
                立即開始製作
                <ArrowRight size={20} />
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <div className="w-5 h-9 border-2 border-gray-700 rounded-full flex justify-center pt-1">
            <div className="w-1 h-2 bg-cyan-400 rounded-full" />
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              三步完成企業影片
            </h2>
            <p className="text-gray-500">無需攝影棚、無需後製團隊，AI 一鍵搞定</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-zinc-900/80 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors"
                >
                  <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon size={24} className={f.color} />
                  </div>
                  <h3 className="font-bold text-lg text-white mb-2">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-24 px-6 bg-zinc-950/50">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">完整製作流程</h2>
            <p className="text-gray-500">從需求到成品，全自動化工作流</p>
          </motion.div>

          <div className="space-y-6">
            {WORKFLOW.map((w, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-6 bg-zinc-900/60 border border-white/5 rounded-2xl p-6"
              >
                <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-purple-600 leading-none min-w-[3rem]">
                  {w.step}
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">{w.title}</h3>
                  <p className="text-gray-500 text-sm">{w.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported types */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-4">適用影片類型</h2>
            <p className="text-gray-500">涵蓋企業影片製作的各種需求</p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-3">
            {SUPPORTED_TYPES.map((type, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2 bg-zinc-900 border border-white/10 text-gray-300 px-5 py-2.5 rounded-full text-sm"
              >
                <CheckCircle size={14} className="text-cyan-400" />
                {type}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Specs */}
      <section className="py-24 px-6 bg-zinc-950/50">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 text-center">
            {[
              { icon: Monitor, label: '最高解析度', value: '1080p', color: 'text-cyan-400' },
              { icon: Users, label: '影片風格', value: '5 種', color: 'text-purple-400' },
              { icon: Zap, label: '生成時長', value: '2-5 分鐘', color: 'text-green-400' },
            ].map((stat, i) => {
              const Icon = stat.icon
              return (
                <div key={i} className="bg-zinc-900 border border-white/5 rounded-2xl p-8">
                  <Icon size={24} className={`${stat.color} mx-auto mb-3`} />
                  <div className={`text-3xl font-black ${stat.color} mb-1`}>{stat.value}</div>
                  <div className="text-gray-500 text-sm">{stat.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-black mb-4">
              準備好了嗎？
            </h2>
            <p className="text-gray-400 mb-8">
              輸入您的 OpenAI 和 fal.ai API Key，即可開始生成企業級影片
            </p>
            <Link
              to="/studio"
              className="inline-flex items-center gap-3 bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold px-10 py-5 rounded-full text-lg hover:opacity-90 transition-opacity"
            >
              <Film size={20} />
              進入 AI 影片工作室
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center text-gray-600 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Film size={14} className="text-cyan-400" />
          <span className="text-gray-400 font-medium">AI Video Studio</span>
        </div>
        <p>Powered by OpenAI GPT-4o mini · Kling 2.6 Pro via fal.ai</p>
      </footer>
    </div>
  )
}
