import { NextRequest, NextResponse } from 'next/server'
import { treeSearch, formatContextFromResults } from '@/lib/tree-index'
import { getLLMClient, getModel } from '@/lib/llm-client'
import type { DocumentPage, TreeNode } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 120
function toHeaderSafe(s: string): string {
  return s
    .replace(/\u2013|\u2014/g, '-')   // em/en dash → hyphen
    .replace(/\u2018|\u2019/g, "'")   // curly quotes → straight
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x00-\x7F]/g, '')     // strip anything else non-ASCII
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      question,
      pages,
      treeIndex,
      documentName,
      docDescription,
      chatHistory = [],
    }: {
      question: string
      pages: DocumentPage[]
      treeIndex: TreeNode[]
      documentName: string
      docDescription: string
      chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
    } = body

    if (!question?.trim()) return NextResponse.json({ error: 'Question required' }, { status: 400 })
    if (!pages?.length)    return NextResponse.json({ error: 'No pages provided' }, { status: 400 })
    
    // ── TREE SEARCH ─────────────────────────────────────────────────────────
    const searchResults = await treeSearch(question, treeIndex, pages, 3)

    if (searchResults.length === 0) {
      return NextResponse.json({ error: 'No relevant sections found.' }, { status: 404 })
    }

    // ── BUILD CONTEXT FROM TREE NODES ────────────────────────────────────────
    const context = formatContextFromResults(searchResults)
    const usedPages = searchResults.flatMap(r => r.pages.map(p => p.pageNumber))
    const usedNodes = searchResults.map(r => ({
      id: r.node.node_id,
      title: toHeaderSafe(r.node.title),
      score: r.relevanceScore,
      pages: `${r.node.start_index}-${r.node.end_index}`,
    }))

    // ── STREAM THE ANSWER ────────────────────────────────────────────────────
    const client = getLLMClient()

    const systemPrompt = `You are DocuChat, an expert document analyst powered by PageIndex Tree Search.

Document: "${documentName}"
Description: ${docDescription}

Sections retrieved via tree search:
${usedNodes.map(n => `  • "${n.title}" (pages ${n.pages}, relevance: ${(n.score * 100).toFixed(0)}%)`).join('\n')}

RULES:
1. Answer ONLY from the provided document sections
2. Cite specific page numbers (e.g. "According to Page 4...")
3. If sections don't contain the answer, say so clearly
4. Use markdown for clarity — headers, bullets, bold for key data
5. Be precise and grounded

DOCUMENT CONTEXT:
${context}`

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-8),
      { role: 'user', content: question },
    ]

    const stream = await client.chat.completions.create({
      model: getModel(),
      messages,
      temperature: 0.2,
      max_tokens: 2048,
      stream: true,
    })

    const webStream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || ''
          if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Used-Pages': JSON.stringify([...new Set(usedPages)].sort((a, b) => a - b)),
        'X-Used-Nodes': JSON.stringify(usedNodes),
      },
    })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chat failed' },
      { status: 500 }
    )
  }
}
