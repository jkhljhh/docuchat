'use client'

import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, Bot, BookOpen, GitBranch } from 'lucide-react'
import type { ChatMessage } from '@/lib/types'

export default function ChatMsg({ message, isStreaming }: {
  message: ChatMessage; isStreaming?: boolean
}) {
  const isUser = message.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${
        isUser
          ? 'bg-amber-400/15 border-amber-400/25'
          : 'bg-ink-800 border-white/8'
      }`}>
        {isUser
          ? <User className="w-4 h-4 text-amber-400" />
          : <Bot className="w-4 h-4 text-white/50" />
        }
      </div>

      <div className={`flex-1 max-w-[87%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 border ${
          isUser
            ? 'bg-amber-400/8 border-amber-400/15 rounded-tr-sm'
            : 'bg-ink-800 border-white/6 rounded-tl-sm'
        }`}>
          {isUser ? (
            <p className="text-sm text-white/85 leading-relaxed">{message.content}</p>
          ) : (
            <div className={`prose text-sm ${isStreaming ? 'blink' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Metadata */}
        {(message.relevantPages?.length || message.usedNodes?.length) && (
          <div className={`flex items-center gap-3 mt-1.5 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
            {message.relevantPages && message.relevantPages.length > 0 && (
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3 h-3 text-amber-400/40" />
                <span className="font-mono text-xs text-amber-400/40">
                  pp. {message.relevantPages.join(', ')}
                </span>
              </div>
            )}
            {message.usedNodes && message.usedNodes.length > 0 && (
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3 h-3 text-jade/40" style={{ color: 'rgba(16,185,129,0.4)' }} />
                <span className="font-mono text-xs" style={{ color: 'rgba(16,185,129,0.4)' }}>
                  {message.usedNodes.map(n => n.title).join(' · ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function TypingDots() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex gap-3"
    >
      <div className="w-8 h-8 rounded-xl bg-ink-800 border border-white/8 flex items-center justify-center">
        <Bot className="w-4 h-4 text-white/50" />
      </div>
      <div className="bg-ink-800 border border-white/6 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-5">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400/50"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
