// ─── Document ────────────────────────────────────────────────────────────────
export interface DocumentPage {
  pageNumber: number
  content: string
  wordCount: number
  charCount: number
}

export interface ProcessedDocument {
  id: string
  name: string
  type: 'pdf' | 'txt' | 'docx' | 'md'
  totalPages: number
  pages: DocumentPage[]
  uploadedAt: Date
  fileSize: number
  treeIndex?: TreeNode[]        // built after upload
  docDescription?: string       // top-level doc summary
}

// ─── PageIndex Tree (mirrors VectifyAI/PageIndex JSON schema) ────────────────
//
// The tree turns a flat list of pages into a hierarchy:
//
//   Document
//   ├── node_id: "0001"  title: "Executive Summary"   pages 1-3
//   ├── node_id: "0002"  title: "Financial Overview"  pages 4-10
//   │   ├── node_id: "0003"  title: "Revenue"         pages 4-6
//   │   └── node_id: "0004"  title: "Cost Analysis"   pages 7-10
//   └── node_id: "0005"  title: "Outlook"             pages 11-12
//
// During retrieval we do TREE SEARCH: LLM picks which top-level branches
// to explore, then drills down to exact leaf nodes — just like AlphaGo.

export interface TreeNode {
  title: string          // section heading e.g. "3.2 Revenue Breakdown"
  node_id: string        // zero-padded e.g. "0007"
  start_index: number    // first page (1-based)
  end_index: number      // last page  (1-based, inclusive)
  summary: string        // LLM-generated 1-2 sentence summary
  nodes?: TreeNode[]     // child sections
}

// ─── Tree Search Result ───────────────────────────────────────────────────────
export interface TreeSearchResult {
  node: TreeNode
  relevanceScore: number          // 0-1
  reasoning: string               // why this node is relevant
  pages: DocumentPage[]           // actual page content inside this node
  depth: number                   // 0 = top-level, 1 = child, etc.
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  relevantPages?: number[]
  usedNodes?: Array<{ id: string; title: string; score: number }>
}

// ─── Legacy flat page search (kept for fallback) ──────────────────────────────
export interface PageSearchResult {
  pageNumber: number
  relevanceScore: number
  content: string
  reasoning: string
}
