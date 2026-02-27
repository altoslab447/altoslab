import React from "react";
import { motion } from "motion/react";

export const About = () => {
  return (
    <section id="about" className="py-24 bg-neutral-900 text-white overflow-hidden">
      <div className="container mx-auto px-6">
        {/* Intro Section */}
        <div className="flex flex-col md:flex-row gap-16 items-center mb-24">
          <motion.div
            className="md:w-1/2"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-block px-3 py-1 mb-6 border border-cyan-500/30 rounded-full bg-cyan-900/10 backdrop-blur-sm">
                <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">WHO WE ARE</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight">
              關於 <span className="text-cyan-400">ALTOS LAB</span>
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed mb-6">
              Altos Lab 是一間專注於數位創新的設計工作室。我們相信，優秀的設計不僅僅是外觀，更是解決問題的關鍵。
            </p>
            <p className="text-gray-400 text-lg leading-relaxed mb-8">
              我們的團隊由一群熱愛技術與藝術的創作者組成，致力於將抽象的概念轉化為具體的數位產品。無論是新創公司還是大型企業，我們都能提供量身打造的解決方案。
            </p>
            
            <div className="flex flex-wrap gap-8 pt-4 border-t border-neutral-800">
                <div>
                    <h4 className="text-3xl font-bold text-white mb-1">50+</h4>
                    <p className="text-sm text-gray-500 uppercase tracking-wider">完成專案</p>
                </div>
                <div>
                    <h4 className="text-3xl font-bold text-white mb-1">100%</h4>
                    <p className="text-sm text-gray-500 uppercase tracking-wider">客戶滿意</p>
                </div>
                <div>
                    <h4 className="text-3xl font-bold text-white mb-1">5+</h4>
                    <p className="text-sm text-gray-500 uppercase tracking-wider">年經驗</p>
                </div>
            </div>
          </motion.div>
          
          <motion.div
            className="md:w-1/2 relative"
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="relative z-10 rounded-2xl overflow-hidden shadow-2xl border border-neutral-800 group">
                <div className="absolute inset-0 bg-cyan-500/20 mix-blend-overlay group-hover:opacity-0 transition-opacity duration-500 z-10"></div>
                <img
                  src="https://images.unsplash.com/photo-1518117823675-9a4bb23df61c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ24lMjBjcmVhdGl2ZSUyMG1pbmltYWxpc3RpYyUyMGRlc2t8ZW58MXx8fHwxNzcxNTE3OTA3fDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Workspace"
                  loading="lazy"
                  className="w-full h-[500px] object-cover transform group-hover:scale-105 transition-transform duration-700 grayscale group-hover:grayscale-0"
                />
            </div>
            {/* Decorative Elements */}
            <div className="absolute -top-6 -right-6 w-full h-full border-2 border-neutral-800 rounded-2xl -z-10"></div>
            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl -z-10"></div>
          </motion.div>
        </div>

      </div>
    </section>
  );
};
