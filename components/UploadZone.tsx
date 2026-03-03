'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Sparkles, AlertCircle } from 'lucide-react'

interface Props { onUpload: (file: File) => void; isLoading: boolean; progress: number }

export default function UploadZone({ onUpload, isLoading, progress }: Props) {
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    setError(null)
    if (rejected.length) { setError('Unsupported file type. Use PDF, TXT, MD, or DOCX.'); return }
    if (accepted[0]) onUpload(accepted[0])
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    disabled: isLoading,
  })

  const stages = [
    { label: 'Parsing pages…', range: [0, 30] },
    { label: 'Detecting structure…', range: [30, 55] },
    { label: 'Building tree index…', range: [55, 85] },
    { label: 'Generating summaries…', range: [85, 100] },
  ]
  const stage = stages.find(s => progress >= s.range[0] && progress < s.range[1]) || stages[3]

  return (
    <div className="w-full max-w-xl mx-auto">
      <motion.div
        {...(getRootProps() as any)}
        className={`relative rounded-2xl p-10 cursor-pointer border-2 border-dashed transition-all duration-300 ${
          isDragActive
            ? 'border-amber-400/60 bg-amber-400/5'
            : 'border-white/10 hover:border-amber-400/30 hover:bg-white/2'
        } ${isLoading ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
        whileHover={!isLoading ? { scale: 1.005 } : {}}
        whileTap={!isLoading ? { scale: 0.998 } : {}}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-5 text-center">
          <motion.div
            className="w-16 h-16 rounded-2xl bg-ink-800 border border-white/10 flex items-center justify-center"
            animate={isDragActive ? { scale: 1.15, rotate: 5 } : { scale: 1, rotate: 0 }}
          >
            {isLoading ? (
              <motion.div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full"
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
            ) : isDragActive ? (
              <Sparkles className="w-7 h-7 text-amber-400" />
            ) : (
              <Upload className="w-7 h-7 text-amber-400/70" />
            )}
          </motion.div>

          <div>
            <p className="font-display font-bold text-lg text-white/80 mb-1">
              {isLoading ? stage.label : isDragActive ? 'Release to analyze' : 'Drop your document'}
            </p>
            <p className="font-mono text-xs text-white/30">
              {isLoading ? `Building PageIndex tree…` : 'PDF · DOCX · TXT · MD · up to 50MB'}
            </p>
          </div>

          {isLoading && (
            <div className="w-full max-w-xs">
              <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-1.5">
                <motion.div
                  className="h-full bg-amber-400 rounded-full"
                  style={{ boxShadow: '0 0 8px rgba(251,191,36,0.4)' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="font-mono text-xs text-white/25 text-right">{progress}%</p>
            </div>
          )}

          {!isLoading && !isDragActive && (
            <div className="flex gap-2">
              {['pdf', 'docx', 'txt', 'md'].map(ext => (
                <span key={ext} className="font-mono text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-white/30 uppercase tracking-wider">
                  {ext}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-2 flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--coral)' }}>
            <AlertCircle className="w-4 h-4" />{error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
