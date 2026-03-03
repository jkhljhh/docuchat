'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronDown, FileText, GitBranch, Zap } from 'lucide-react'
import { useState } from 'react'
import { flattenTree } from '@/lib/tree-index'
import type { TreeNode, ProcessedDocument } from '@/lib/types'

interface TreeViewerProps {
  document: ProcessedDocument
  activeNodeIds: string[]
  activeNodeDetails: Array<{ id: string; title: string; score: number }>
}

function NodeRow({
  node,
  depth,
  isActive,
  score,
  expanded,
  onToggle,
}: {
  node: TreeNode
  depth: number
  isActive: boolean
  score?: number
  expanded: boolean
  onToggle: () => void
}) {
  const hasChildren = node.nodes && node.nodes.length > 0
  const indent = depth * 14

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`group relative cursor-pointer transition-all duration-200 ${
        isActive ? 'bg-amber-400/5' : 'hover:bg-white/2'
      }`}
      style={{ paddingLeft: `${indent + 12}px` }}
      onClick={onToggle}
    >
      {/* Active indicator bar */}
      {isActive && (
        <motion.div
          layoutId={`bar-${node.node_id}`}
          className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-400"
        />
      )}

      <div className="flex items-start gap-2 py-2.5 pr-3">
        {/* Expand icon */}
        <div className="flex-shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center">
          {hasChildren ? (
            expanded
              ? <ChevronDown className="w-3 h-3 text-white/25" />
              : <ChevronRight className="w-3 h-3 text-white/25" />
          ) : (
            <div className="w-1 h-1 rounded-full bg-white/15 mx-auto" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`font-mono text-xs font-medium truncate leading-tight ${
              isActive ? 'text-amber-400' : 'text-white/55 group-hover:text-white/75'
            }`}>
              {node.title}
            </span>
            {isActive && score !== undefined && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex-shrink-0 text-xs font-mono text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded"
              >
                {(score * 100).toFixed(0)}%
              </motion.span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-white/20">
              pp. {node.start_index}–{node.end_index}
            </span>
            {depth === 0 && node.nodes && node.nodes.length > 0 && (
              <span className="font-mono text-xs text-white/15">
                · {node.nodes.length} sub
              </span>
            )}
          </div>
          {isActive && node.summary && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-1 text-xs text-amber-400/50 leading-relaxed line-clamp-2"
            >
              {node.summary}
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function TreeViewer({ document, activeNodeIds, activeNodeDetails }: TreeViewerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const tree = document.treeIndex || []

  const renderNodes = (nodes: TreeNode[], depth = 0): React.ReactNode[] => {
    return nodes.flatMap(node => {
      const isActive = activeNodeIds.includes(node.node_id)
      const detail = activeNodeDetails.find(d => d.id === node.node_id)
      const isExpanded = expanded.has(node.node_id) || isActive
      const hasChildren = node.nodes && node.nodes.length > 0

      return [
        <NodeRow
          key={node.node_id}
          node={node}
          depth={depth}
          isActive={isActive}
          score={detail?.score}
          expanded={isExpanded}
          onToggle={() => toggle(node.node_id)}
        />,
        ...(hasChildren && isExpanded
          ? renderNodes(node.nodes!, depth + 1)
          : []),
      ]
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-3.5 h-3.5 text-amber-400/60" />
          <span className="font-display text-sm font-semibold text-white/70 truncate">
            {document.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-white/25">{document.totalPages} pages</span>
          <span className="text-white/10">·</span>
          <span className="font-mono text-xs text-white/25">{tree.length} sections</span>
          {activeNodeIds.length > 0 && (
            <>
              <span className="text-white/10">·</span>
              <div className="flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 text-amber-400" />
                <span className="font-mono text-xs text-amber-400">{activeNodeIds.length} active</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Doc description */}
      {document.docDescription && (
        <div className="px-4 py-2.5 border-b border-white/5 flex-shrink-0">
          <p className="text-xs text-white/30 leading-relaxed line-clamp-2">
            {document.docDescription}
          </p>
        </div>
      )}

      {/* Tree label */}
      <div className="px-4 py-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-white/20 uppercase tracking-wider">
            🌲 PageIndex Tree
          </span>
        </div>
      </div>

      {/* Tree nodes */}
      <div className="flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <span className="font-mono text-xs text-white/30">Building tree...</span>
            </div>
          </div>
        ) : (
          <div className="py-1">
            {renderNodes(tree)}
          </div>
        )}
      </div>
    </div>
  )
}
