'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, RotateCcw, Trash2, GitBranch, Cpu, ChevronRight, Lightbulb, X } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import UploadZone from '@/components/UploadZone'
import TreeViewer from '@/components/TreeViewer'
import ChatMsg, { TypingDots } from '@/components/ChatMessage'
import type { ProcessedDocument, ChatMessage, TreeNode } from '@/lib/types'

const SUGGESTIONS = [
  'Summarize the main topics covered',
  'What are the key conclusions?',
  'List the most important data points',
  'What does the introduction say?',
  'Explain the methodology used',
]

export default function Page() {
  const [doc, setDoc] = useState<ProcessedDocument | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeNodeIds, setActiveNodeIds] = useState<string[]>([])
  const [activeNodeDetails, setActiveNodeDetails] = useState<Array<{ id: string; title: string; score: number }>>([])
  const [error, setError] = useState<string | null>(null)
  const [showMcp, setShowMcp] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    setError(null)
    setUploadProgress(5)

    const tick = setInterval(() => {
      setUploadProgress(p => Math.min(p + 4, 88))
    }, 400)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      clearInterval(tick)
      setUploadProgress(100)
      await new Promise(r => setTimeout(r, 300))

      setDoc({
        ...data.document,
        uploadedAt: new Date(data.document.uploadedAt),
        treeIndex: data.document.treeIndex,
        docDescription: data.document.docDescription,
      })
      setMessages([])
      historyRef.current = []
      setActiveNodeIds([])
      setActiveNodeDetails([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      clearInterval(tick)
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [])

  const handleSend = useCallback(async (question?: string) => {
    const q = question || input.trim()
    if (!q || !doc || isThinking || isStreaming) return

    setInput('')
    setError(null)
    setActiveNodeIds([])
    setActiveNodeDetails([])

    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: q, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setIsThinking(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          pages: doc.pages,
          treeIndex: doc.treeIndex || [],
          documentName: doc.name,
          docDescription: doc.docDescription || '',
          chatHistory: historyRef.current,
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Chat failed')
      }

      // Parse node info from headers
      const pagesHeader = res.headers.get('X-Used-Pages')
      const nodesHeader = res.headers.get('X-Used-Nodes')
      let usedPages: number[] = []
      let usedNodes: Array<{ id: string; title: string; score: number; pages: string }> = []

      if (pagesHeader) usedPages = JSON.parse(pagesHeader)
      if (nodesHeader) {
        usedNodes = JSON.parse(nodesHeader)
        setActiveNodeIds(usedNodes.map(n => n.id))
        setActiveNodeDetails(usedNodes.map(n => ({ id: n.id, title: n.title, score: n.score })))
      }

      setIsThinking(false)
      setIsStreaming(true)

      const msgId = uuidv4()
      const assistantMsg: ChatMessage = {
        id: msgId, role: 'assistant', content: '', timestamp: new Date(),
        relevantPages: usedPages,
        usedNodes: usedNodes.map(n => ({ id: n.id, title: n.title, score: n.score })),
      }
      setMessages(prev => [...prev, assistantMsg])

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')

      const dec = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = dec.decode(value, { stream: true }).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const { text } = JSON.parse(data)
            if (text) {
              full += text
              setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: full } : m))
            }
          } catch {}
        }
      }

      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: q },
        { role: 'assistant', content: full },
      ].slice(-12)

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsThinking(false)
      setIsStreaming(false)
    }
  }, [doc, input, isThinking, isStreaming])

  const reset = () => {
    setDoc(null); setMessages([]); setError(null)
    setActiveNodeIds([]); setActiveNodeDetails([])
    historyRef.current = []
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b flex items-center gap-4 px-5 py-3" style={{ borderColor: 'var(--border)', background: 'rgba(8,8,16,0.8)' }}>
        <div className="flex gap-1.5">
          {['#ff6b6b', '#fbbf24', '#10b981'].map(c => (
            <div key={c} className="w-2.5 h-2.5 rounded-full opacity-70" style={{ background: c }} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-amber-400" />
          <span className="font-display font-bold text-lg tracking-tight">
            Docu<span style={{ color: 'var(--amber)' }}>Chat</span>
            <span className="font-mono text-xs font-normal ml-2" style={{ color: 'var(--faint)' }}>v2 · PageIndex Tree</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 ml-4">
          <div className="status-dot" />
          <span className="font-mono text-xs" style={{ color: 'var(--faint)' }}>
            Inspired by VectifyAI/PageIndex · 11.6k ⭐
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowMcp(!showMcp)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-xs transition-all ${
              showMcp
                ? 'border-jade/40 text-jade bg-jade/10'
                : 'border-white/10 text-white/35 hover:border-white/20'
            }`}
            style={{ '--tw-text-opacity': 1, color: showMcp ? 'var(--jade)' : undefined } as any}
          >
            <Cpu className="w-3 h-3" />
            MCP
          </button>
          {doc && (
            <button onClick={reset} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 font-mono text-xs text-white/35 hover:border-white/20 transition-all">
              <RotateCcw className="w-3 h-3" />
              New
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {!doc ? (
            /* ── Landing ── */
            <motion.div key="land" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-8 gap-12">

              <div className="text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-6 font-mono text-xs"
                  style={{ background: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.2)', color: 'var(--amber)' }}
                >
                  <div className="status-dot" />
                  VectifyAI PageIndex Algorithm · Hierarchical Tree Search
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="font-display font-black leading-none mb-4 tracking-tight"
                  style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', color: 'var(--text)' }}
                >
                  Document Chat<br />
                  <span style={{ color: 'var(--amber)' }}>with Tree Search</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                  className="font-mono text-sm max-w-md mx-auto leading-relaxed"
                  style={{ color: 'var(--muted)' }}
                >
                  Builds a hierarchical section tree from your document.
                  LLM navigates the tree — like AlphaGo — to find exact answers.
                </motion.p>
              </div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="w-full">
                <UploadZone onUpload={handleUpload} isLoading={isUploading} progress={uploadProgress} />
                <AnimatePresence>
                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-center font-mono text-sm mt-3" style={{ color: 'var(--coral)' }}>
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* How it works */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                className="grid grid-cols-3 gap-4 max-w-lg w-full">
                {[
                  { icon: '📄', t: 'Upload', d: 'PDF · DOCX · TXT · MD' },
                  { icon: '🌲', t: 'Tree Built', d: 'AI maps section hierarchy' },
                  { icon: '🔍', t: 'Tree Search', d: 'AI navigates to answer' },
                ].map((s, i) => (
                  <motion.div key={s.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.08 }}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border text-center"
                    style={{ background: 'var(--elevated)', borderColor: 'var(--border)' }}>
                    <span className="text-2xl">{s.icon}</span>
                    <span className="font-display font-semibold text-sm" style={{ color: 'rgba(240,240,232,0.7)' }}>{s.t}</span>
                    <span className="font-mono text-xs" style={{ color: 'var(--faint)' }}>{s.d}</span>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

          ) : (
            /* ── Chat interface ── */
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex overflow-hidden">

              {/* Tree sidebar */}
              <motion.aside
                initial={{ x: -280, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="w-64 flex-shrink-0 border-r flex flex-col"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <TreeViewer document={doc} activeNodeIds={activeNodeIds} activeNodeDetails={activeNodeDetails} />

                {/* MCP panel */}
                <AnimatePresence>
                  {showMcp && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t overflow-hidden"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div className="p-3 space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Cpu className="w-3 h-3" style={{ color: 'var(--jade)' }} />
                          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--jade)' }}>MCP Server</span>
                        </div>
                        <p className="font-mono text-xs leading-relaxed" style={{ color: 'var(--faint)' }}>
                          Tools exposed at <span style={{ color: 'var(--amber)' }}>/api/mcp</span>:
                        </p>
                        {['build_tree_index', 'tree_search'].map(t => (
                          <div key={t} className="px-2 py-1.5 rounded-lg border font-mono text-xs" style={{ background: 'var(--elevated)', borderColor: 'var(--border)', color: 'rgba(16,185,129,0.7)' }}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.aside>

              {/* Chat area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex-shrink-0 border-b flex items-center gap-3 px-5 py-2.5"
                  style={{ borderColor: 'var(--border)', background: 'rgba(8,8,16,0.6)' }}>
                  <span className="font-display text-sm font-semibold truncate max-w-xs" style={{ color: 'rgba(240,240,232,0.6)' }}>
                    {doc.name}
                  </span>
                  <span className="font-mono text-xs" style={{ color: 'var(--faint)' }}>· {doc.totalPages}p</span>

                  <div className="ml-auto flex items-center gap-2">
                    {messages.length > 0 && (
                      <button
                        onClick={() => { setMessages([]); historyRef.current = []; setActiveNodeIds([]); setActiveNodeDetails([]) }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-xs transition-all"
                        style={{ borderColor: 'var(--border)', color: 'var(--faint)' }}
                      >
                        <Trash2 className="w-3 h-3" />Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                  {messages.length === 0 && (
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center justify-center h-full gap-6">
                      <div className="text-center">
                        <div className="text-4xl mb-3">🌲</div>
                        <h2 className="font-display text-xl font-bold mb-1" style={{ color: 'rgba(240,240,232,0.7)' }}>
                          Tree index ready
                        </h2>
                        <p className="font-mono text-sm" style={{ color: 'var(--muted)' }}>
                          {doc.treeIndex?.length || 0} sections indexed · Ask anything
                        </p>
                        {doc.docDescription && (
                          <p className="font-mono text-xs mt-3 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--faint)' }}>
                            {doc.docDescription}
                          </p>
                        )}
                      </div>

                      <div className="w-full max-w-lg space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb className="w-3 h-3 text-amber-400/50" />
                          <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Try asking</span>
                        </div>
                        {SUGGESTIONS.map((s, i) => (
                          <motion.button key={s}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07 }}
                            onClick={() => handleSend(s)}
                            className="w-full text-left px-4 py-3 rounded-xl border transition-all group flex items-center gap-3"
                            style={{ background: 'var(--elevated)', borderColor: 'var(--border)' }}
                          >
                            <span className="text-sm flex-1" style={{ color: 'var(--muted)' }}>{s}</span>
                            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-30 group-hover:opacity-70 transition-opacity"
                              style={{ color: 'var(--amber)' }} />
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {messages.map((msg, i) => (
                    <ChatMsg key={msg.id} message={msg}
                      isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'} />
                  ))}

                  {isThinking && <TypingDots />}

                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-mono"
                        style={{ background: 'rgba(255,107,107,0.05)', borderColor: 'rgba(255,107,107,0.2)', color: 'var(--coral)' }}>
                        <span className="flex-1">{error}</span>
                        <button onClick={() => setError(null)}><X className="w-4 h-4 opacity-50" /></button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="flex-shrink-0 border-t p-4" style={{ borderColor: 'var(--border)', background: 'rgba(8,8,16,0.6)' }}>
                  {activeNodeDetails.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 mb-2.5 px-1">
                      <GitBranch className="w-3 h-3" style={{ color: 'rgba(251,191,36,0.4)' }} />
                      <span className="font-mono text-xs" style={{ color: 'rgba(251,191,36,0.4)' }}>
                        Used: {activeNodeDetails.map(n => `"${n.title}"`).join(', ')}
                      </span>
                    </motion.div>
                  )}
                  <div className="flex gap-3 items-end">
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="Ask anything about your document…"
                      rows={1}
                      disabled={isThinking || isStreaming}
                      className="flex-1 rounded-2xl px-4 py-3 text-sm border outline-none resize-none transition-colors disabled:opacity-50"
                      style={{
                        background: 'var(--elevated)',
                        borderColor: 'var(--border)',
                        color: 'rgba(240,240,232,0.82)',
                        minHeight: '48px', maxHeight: '120px',
                        fontFamily: 'var(--font-mono)',
                      }}
                      onInput={e => {
                        const t = e.target as HTMLTextAreaElement
                        t.style.height = 'auto'
                        t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                      }}
                    />
                    <motion.button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || isThinking || isStreaming}
                      className="w-12 h-12 rounded-2xl border flex items-center justify-center transition-all disabled:opacity-25"
                      style={{ background: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.3)', color: 'var(--amber)' }}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                  </div>
                  <p className="text-center font-mono text-xs mt-2" style={{ color: 'var(--faint)' }}>
                    Enter to send · Tree search finds exact sections
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
