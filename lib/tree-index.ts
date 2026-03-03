/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║         PAGEINDEX TREE ALGORITHM — TypeScript Implementation         ║
 * ║         Inspired by VectifyAI/PageIndex (MIT License)                ║
 * ║                                                                       ║
 * ║  HOW IT WORKS:                                                        ║
 * ║                                                                       ║
 * ║  STEP 1 — BUILD TREE (once per document upload)                      ║
 * ║    • Look for a real Table of Contents in first N pages               ║
 * ║    • If found  → parse into tree structure directly                   ║
 * ║    • If not    → LLM reads batches of pages and infers sections       ║
 * ║    • Result: hierarchical JSON like VectifyAI's schema               ║
 * ║                                                                       ║
 * ║  STEP 2 — TREE SEARCH (on every question)                            ║
 * ║    • Show LLM only the TOP-LEVEL branch titles + summaries           ║
 * ║    • LLM picks which branches to explore (like AlphaGo tree search)  ║
 * ║    • For chosen branches, expand to child nodes                       ║
 * ║    • Collect all pages in the most relevant leaf nodes               ║
 * ║    • Send those pages as context for the final answer                ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { getLLMClient, getModel } from './llm-client'
import type { DocumentPage, TreeNode, TreeSearchResult } from './types'

// ─── Constants (mirrors VectifyAI defaults) ───────────────────────────────────
const MAX_PAGES_PER_NODE = 10   // max pages in one leaf node
const TOC_CHECK_PAGES   = 15    // pages to scan for a real ToC
const BATCH_SIZE        = 8     // pages per LLM batch when building tree

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — BUILD THE TREE INDEX
// ═══════════════════════════════════════════════════════════════════════════════

export async function buildTreeIndex(
  pages: DocumentPage[],
  docName: string
): Promise<{ tree: TreeNode[]; docDescription: string }> {
  // 1a. Try to detect a real Table of Contents
  const tocResult = await detectTableOfContents(pages.slice(0, TOC_CHECK_PAGES), docName)

  let tree: TreeNode[]

  if (tocResult) {
    // 1b. Real ToC found — map it to our tree structure
    tree = await buildTreeFromToC(tocResult, pages)
  } else {
    // 1c. No ToC — LLM infers the structure batch by batch
    tree = await buildTreeByInference(pages)
  }

  // 1d. Generate a top-level document description
  const docDescription = await generateDocDescription(tree, docName)

  return { tree, docDescription }
}

// ─── Detect a real Table of Contents ─────────────────────────────────────────
async function detectTableOfContents(
  firstPages: DocumentPage[],
  docName: string
): Promise<string | null> {
  const client = getLLMClient()
  const preview = firstPages.map(p => `--- Page ${p.pageNumber} ---\n${p.content}`).join('\n\n')

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [{
      role: 'user',
      content: `Look at these pages from "${docName}". 
Does this document contain a Table of Contents (TOC) or Contents page?

If YES: Extract it as plain text exactly as it appears (section titles + page numbers).
If NO: Reply with exactly: NO_TOC

Pages:
${preview.slice(0, 6000)}`,
    }],
    temperature: 0,
    max_tokens: 1000,
  })

  const reply = response.choices[0]?.message?.content?.trim() || ''
  return reply === 'NO_TOC' || reply.startsWith('NO') ? null : reply
}

// ─── Build tree from a real ToC ───────────────────────────────────────────────
async function buildTreeFromToC(
  tocText: string,
  pages: DocumentPage[]
): Promise<TreeNode[]> {
  const client = getLLMClient()
  const totalPages = pages.length

  // Ask LLM to parse the ToC into our JSON schema
  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [{
      role: 'user',
      content: `Convert this Table of Contents into a JSON tree structure.
Total document pages: ${totalPages}

TOC TEXT:
${tocText}

Return a JSON array where each item has:
- "title": section title (string)
- "node_id": zero-padded counter like "0001", "0002" etc
- "start_index": starting page number (integer)  
- "end_index": ending page number (integer, inclusive)
- "summary": "" (leave empty, will be filled later)
- "nodes": [] or array of child sections with the same structure

Rules:
- top-level sections only get direct children (max 2 levels deep)
- if page numbers are missing from ToC, estimate them proportionally
- node_ids must be unique across the entire tree

Return ONLY raw JSON array, no markdown, no explanation.`,
    }],
    temperature: 0,
    max_tokens: 3000,
  })

  const raw = response.choices[0]?.message?.content?.trim() || '[]'
  const cleaned = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    const tree: TreeNode[] = JSON.parse(cleaned)
    // Enrich with summaries
    return await enrichTreeWithSummaries(tree, pages)
  } catch {
    // Fallback to inference-based
    return await buildTreeByInference(pages)
  }
}

// ─── Build tree by LLM inference (no ToC) ────────────────────────────────────
async function buildTreeByInference(pages: DocumentPage[]): Promise<TreeNode[]> {
  const client = getLLMClient()
  const batches: Array<{ startPage: number; endPage: number; content: string }> = []

  // Group pages into batches
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE)
    batches.push({
      startPage: batch[0].pageNumber,
      endPage: batch[batch.length - 1].pageNumber,
      content: batch.map(p => `--- Page ${p.pageNumber} ---\n${p.content.slice(0, 500)}`).join('\n\n'),
    })
  }

  // For each batch, identify the sections within it
  const allSections: TreeNode[] = []
  let nodeCounter = 1

  for (const batch of batches) {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [{
        role: 'user',
        content: `Analyze pages ${batch.startPage}–${batch.endPage} of this document.
Identify the distinct sections or topics in these pages.

${batch.content}

Return a JSON array of sections found. Each item:
- "title": descriptive section title (string)
- "node_id": "${String(nodeCounter).padStart(4, '0')}" through "${String(nodeCounter + 5).padStart(4, '0')}"
- "start_index": starting page number
- "end_index": ending page number  
- "summary": 1-2 sentence summary of what this section contains
- "nodes": []

Return ONLY raw JSON array. No markdown.`,
      }],
      temperature: 0.1,
      max_tokens: 1500,
    })

    const raw = response.choices[0]?.message?.content?.trim() || '[]'
    const cleaned = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()

    try {
      const sections: TreeNode[] = JSON.parse(cleaned)
      // Fix node_ids to be globally unique
      sections.forEach((s, i) => {
        s.node_id = String(nodeCounter + i).padStart(4, '0')
      })
      nodeCounter += sections.length + 1
      allSections.push(...sections)
    } catch {
      // If parse fails, create a single section for this batch
      allSections.push({
        title: `Pages ${batch.startPage}–${batch.endPage}`,
        node_id: String(nodeCounter++).padStart(4, '0'),
        start_index: batch.startPage,
        end_index: batch.endPage,
        summary: 'Document section',
        nodes: [],
      })
    }
  }

  return mergeAdjacentSections(allSections)
}

// ─── Merge sections that are too small ────────────────────────────────────────
function mergeAdjacentSections(sections: TreeNode[]): TreeNode[] {
  if (sections.length === 0) return sections
  const merged: TreeNode[] = []
  let current = { ...sections[0] }

  for (let i = 1; i < sections.length; i++) {
    const pageCount = current.end_index - current.start_index + 1
    if (pageCount < 2 && merged.length > 0) {
      // Too small — merge into previous
      merged[merged.length - 1].end_index = current.end_index
    } else {
      merged.push(current)
    }
    current = { ...sections[i] }
  }
  merged.push(current)
  return merged
}

// ─── Add LLM summaries to tree nodes ─────────────────────────────────────────
async function enrichTreeWithSummaries(
  nodes: TreeNode[],
  pages: DocumentPage[]
): Promise<TreeNode[]> {
  const client = getLLMClient()

  const enriched = await Promise.all(
    nodes.map(async (node) => {
      if (node.summary && node.summary.length > 20) return node // already has one

      const nodePages = pages.filter(
        p => p.pageNumber >= node.start_index && p.pageNumber <= node.end_index
      )
      const preview = nodePages.map(p => p.content).join('\n').slice(0, 800)

      const response = await client.chat.completions.create({
        model: getModel(),
        messages: [{
          role: 'user',
          content: `Summarize this document section in 1-2 sentences. Be specific about key information.\n\nSection: "${node.title}"\n\n${preview}`,
        }],
        temperature: 0.1,
        max_tokens: 100,
      })

      return {
        ...node,
        summary: response.choices[0]?.message?.content?.trim() || node.summary,
        nodes: node.nodes && node.nodes.length > 0
          ? await enrichTreeWithSummaries(node.nodes, pages)
          : node.nodes,
      }
    })
  )

  return enriched
}

// ─── Generate top-level document description ──────────────────────────────────
async function generateDocDescription(tree: TreeNode[], docName: string): Promise<string> {
  const client = getLLMClient()
  const treeOutline = tree.map(n => `• ${n.title}: ${n.summary}`).join('\n')

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [{
      role: 'user',
      content: `Based on these sections, write a 2-3 sentence description of what "${docName}" is about.\n\n${treeOutline}`,
    }],
    temperature: 0.2,
    max_tokens: 150,
  })

  return response.choices[0]?.message?.content?.trim() || `Document: ${docName}`
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — TREE SEARCH (run on every user question)
// ═══════════════════════════════════════════════════════════════════════════════

export async function treeSearch(
  question: string,
  tree: TreeNode[],
  pages: DocumentPage[],
  maxNodes = 3
): Promise<TreeSearchResult[]> {
  // Step 2a: Show top-level branches to LLM, ask which to explore
  const topLevelResults = await selectRelevantBranches(question, tree, maxNodes)

  const results: TreeSearchResult[] = []

  for (const branch of topLevelResults) {
    if (branch.node.nodes && branch.node.nodes.length > 0) {
      // Step 2b: This branch has children — drill down one more level
      const childResults = await selectRelevantBranches(
        question,
        branch.node.nodes,
        2  // pick top 2 children per branch
      )
      for (const child of childResults) {
        results.push({
          ...child,
          depth: 1,
          pages: getPagesForNode(child.node, pages),
        })
      }
    } else {
      // Step 2c: Leaf node — use it directly
      results.push({
        ...branch,
        depth: 0,
        pages: getPagesForNode(branch.node, pages),
      })
    }
  }

  // Deduplicate by node_id and sort by score
  const seen = new Set<string>()
  return results
    .filter(r => {
      if (seen.has(r.node.node_id)) return false
      seen.add(r.node.node_id)
      return true
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxNodes + 1)
}

// ─── Ask LLM which branches are relevant ─────────────────────────────────────
async function selectRelevantBranches(
  question: string,
  nodes: TreeNode[],
  maxSelect: number
): Promise<TreeSearchResult[]> {
  const client = getLLMClient()

  const nodeList = nodes.map(n =>
    `node_id: "${n.node_id}" | "${n.title}" (pages ${n.start_index}–${n.end_index})\nSummary: ${n.summary}`
  ).join('\n\n')

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [{
      role: 'user',
      content: `You are navigating a document tree to find sections relevant to a question.

QUESTION: "${question}"

AVAILABLE SECTIONS:
${nodeList}

Select up to ${maxSelect} sections most relevant to answering the question.
Return ONLY a JSON array:
[
  { "node_id": "...", "relevanceScore": 0.0-1.0, "reasoning": "one sentence why" }
]

Order by relevance descending. Return raw JSON only.`,
    }],
    temperature: 0,
    max_tokens: 500,
  })

  const raw = response.choices[0]?.message?.content?.trim() || '[]'
  const cleaned = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    const selections: Array<{ node_id: string; relevanceScore: number; reasoning: string }> =
      JSON.parse(cleaned)

    return selections
      .map(s => {
        const node = nodes.find(n => n.node_id === s.node_id)
        if (!node) return null
        return {
          node,
          relevanceScore: s.relevanceScore,
          reasoning: s.reasoning,
          pages: [],  // filled later
          depth: 0,
        }
      })
      .filter((r): r is TreeSearchResult => r !== null)
  } catch {
    // Fallback: return all nodes with equal scores
    return nodes.slice(0, maxSelect).map(node => ({
      node,
      relevanceScore: 0.5,
      reasoning: 'Selected as fallback',
      pages: [],
      depth: 0,
    }))
  }
}

// ─── Get pages that belong to a tree node ─────────────────────────────────────
function getPagesForNode(node: TreeNode, pages: DocumentPage[]): DocumentPage[] {
  return pages.filter(
    p => p.pageNumber >= node.start_index && p.pageNumber <= node.end_index
  )
}

// ─── Format tree search results as context for the LLM ───────────────────────
export function formatContextFromResults(results: TreeSearchResult[]): string {
  return results.map(r => {
    const pageContent = r.pages.map(p =>
      `--- Page ${p.pageNumber} ---\n${p.content}`
    ).join('\n\n')

    return `═══ Section: "${r.node.title}" (pages ${r.node.start_index}–${r.node.end_index}) ═══\n${pageContent}`
  }).join('\n\n')
}

// ─── Flatten tree to array (for UI display) ───────────────────────────────────
export function flattenTree(nodes: TreeNode[], depth = 0): Array<TreeNode & { depth: number }> {
  const flat: Array<TreeNode & { depth: number }> = []
  for (const node of nodes) {
    flat.push({ ...node, depth })
    if (node.nodes && node.nodes.length > 0) {
      flat.push(...flattenTree(node.nodes, depth + 1))
    }
  }
  return flat
}
