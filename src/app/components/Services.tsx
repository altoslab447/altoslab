import React from "react";
import { motion } from "motion/react";
import {
  Brain,
  Bot,
  BarChart2,
  Cpu,
  Eye,
  MessageSquare,
  Search,
  Rocket,
  CheckCircle2,
} from "lucide-react";

const services = [
  {
    icon: <Brain size={32} />,
    title: "AI 策略諮詢",
    description: "深入評估企業現況，規劃最適合的 AI 導入路線圖，加速數位轉型。",
  },
  {
    icon: <Bot size={32} />,
    title: "智慧自動化",
    description: "將重複性流程交由 AI 處理，大幅降低人力成本，釋放核心人才潛能。",
  },
  {
    icon: <MessageSquare size={32} />,
    title: "AI 客服系統",
    description: "24/7 全天候智能客服，即時回應客戶需求，提升滿意度與轉換率。",
  },
  {
    icon: <BarChart2 size={32} />,
    title: "數據分析與洞察",
    description: "整合企業數據，透過 AI 模型挖掘隱藏商機，驅動數據化決策。",
  },
  {
    icon: <Eye size={32} />,
    title: "電腦視覺應用",
    description: "影像辨識、瑕疵檢測、人流分析，為製造與零售業帶來全新效率。",
  },
  {
    icon: <Cpu size={32} />,
    title: "客製 AI 模型開發",
    description: "針對企業專屬需求訓練私有模型，資料不外流，效果完全貼合業務場景。",
  },
];

const workflowSteps = [
  {
    icon: <Search size={24} />,
    step: "01",
    title: "需求評估",
    desc: "深入了解企業現有流程與痛點，精準找出 AI 導入的最高價值機會。",
  },
  {
    icon: <Brain size={24} />,
    step: "02",
    title: "方案設計",
    desc: "量身打造 AI 解決方案架構，選用最適技術，確保可落地性與擴展性。",
  },
  {
    icon: <Rocket size={24} />,
    step: "03",
    title: "快速落地",
    desc: "敏捷開發與快速部署，最短時間內讓企業感受到 AI 帶來的實際效益。",
  },
  {
    icon: <CheckCircle2 size={24} />,
    step: "04",
    title: "持續優化",
    desc: "上線後持續監控模型表現，定期迭代優化，確保效能長期維持最佳狀態。",
  },
];

export const Services = () => {
  return (
    <section
      id="services"
      className="py-32 bg-black text-white relative border-t border-neutral-900 overflow-hidden"
    >
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/5 blur-3xl rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20 flex flex-col md:flex-row justify-between items-end gap-8"
        >
          <div>
            <div className="inline-block px-3 py-1 mb-6 border border-cyan-500/30 rounded-full bg-cyan-900/10 backdrop-blur-sm">
              <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">
                AI SOLUTIONS
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              企業級 <span className="text-cyan-400">AI 全方位</span>
              <br />
              解決方案
            </h2>
            <p className="text-gray-400 max-w-xl text-lg leading-relaxed">
              我們協助企業快速導入 AI，從策略規劃到技術落地，一站式服務讓您的組織在競爭中搶得先機。
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-10 shrink-0">
            <div className="text-right">
              <h4 className="text-3xl font-black text-white mb-1">300<span className="text-cyan-400">%</span></h4>
              <p className="text-xs text-gray-500 uppercase tracking-wider">平均效率提升</p>
            </div>
            <div className="text-right">
              <h4 className="text-3xl font-black text-white mb-1">&lt;3<span className="text-cyan-400">月</span></h4>
              <p className="text-xs text-gray-500 uppercase tracking-wider">快速導入上線</p>
            </div>
            <div className="text-right">
              <h4 className="text-3xl font-black text-white mb-1">50<span className="text-cyan-400">+</span></h4>
              <p className="text-xs text-gray-500 uppercase tracking-wider">企業客戶</p>
            </div>
          </div>
        </motion.div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-32">
          {services.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.5 }}
              className="bg-neutral-900/60 backdrop-blur-sm p-8 rounded-2xl group cursor-pointer border border-neutral-800 hover:border-cyan-500/50 hover:bg-neutral-900 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300"
            >
              <div className="text-cyan-400 mb-6 inline-flex p-3 bg-neutral-800 rounded-xl group-hover:bg-cyan-500/10 group-hover:scale-110 transition-all duration-300">
                {service.icon}
              </div>
              <h3 className="text-xl font-bold mb-4 text-white group-hover:text-cyan-400 transition-colors">
                {service.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {service.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Workflow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-block px-3 py-1 mb-4 border border-cyan-500/30 rounded-full bg-cyan-900/10">
            <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">
              HOW WE WORK
            </span>
          </div>
          <h3 className="text-3xl font-bold text-white">導入流程</h3>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {workflowSteps.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="relative p-8 border-l border-neutral-800 hover:border-cyan-500 transition-colors duration-300 group"
            >
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-neutral-800/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-r-xl" />
              <div className="text-5xl font-black text-neutral-800 mb-6 group-hover:text-cyan-500/20 transition-colors select-none">
                {item.step}
              </div>
              <h4 className="text-lg font-bold text-white mb-3 group-hover:text-cyan-400 transition-colors">
                {item.title}
              </h4>
              <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
