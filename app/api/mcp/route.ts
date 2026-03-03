import { NextRequest, NextResponse } from 'next/server'
import { treeSearch, buildTreeIndex } from '@/lib/tree-index'
import type { DocumentPage, TreeNode } from '@/lib/types'

export const runtime = 'nodejs'

const SERVER_INFO = {
  name: 'docuchat-pageindex-mcp',
  version: '2.0.0',
  description: 'PageIndex Tree Search MCP server. Build hierarchical document trees and search them with LLM reasoning.',
}

const TOOLS = [
  {
    name: 'build_tree_index',
    description: 'Build a PageIndex tree from document pages. Returns a hierarchical section tree.',
    inputSchema: {
      type: 'object',
      properties: {
        pages: { type: 'array', description: 'Document pages array' },
        docName: { type: 'string', description: 'Document filename' },
      },
      required: ['pages', 'docName'],
    },
  },
  {
    name: 'tree_search',
    description: 'Search a document tree using LLM reasoning to find relevant sections.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        treeIndex: { type: 'array', description: 'Tree built by build_tree_index' },
        pages: { type: 'array' },
        maxNodes: { type: 'number', description: 'Max sections to retrieve (default 3)' },
      },
      required: ['question', 'treeIndex', 'pages'],
    },
  },
]

export async function GET() {
  return NextResponse.json({ mcp: '1.0', server: SERVER_INFO, tools: TOOLS })
}

export async function POST(req: NextRequest) {
  try {
    const { method, params } = await req.json()

    if (method === 'initialize') {
      return NextResponse.json({
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: true },
          serverInfo: { name: SERVER_INFO.name, version: SERVER_INFO.version },
        },
      })
    }

    if (method === 'tools/list') {
      return NextResponse.json({ result: { tools: TOOLS } })
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params

      if (name === 'build_tree_index') {
        const { tree, docDescription } = await buildTreeIndex(args.pages, args.docName)
        return NextResponse.json({
          result: {
            content: [{ type: 'text', text: JSON.stringify({ tree, docDescription }, null, 2) }],
          },
        })
      }

      if (name === 'tree_search') {
        const results = await treeSearch(
          args.question,
          args.treeIndex as TreeNode[],
          args.pages as DocumentPage[],
          args.maxNodes || 3
        )
        return NextResponse.json({
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify(
                results.map(r => ({
                  section: r.node.title,
                  pages: `${r.node.start_index}–${r.node.end_index}`,
                  score: r.relevanceScore,
                  reasoning: r.reasoning,
                  contentPreview: r.pages[0]?.content?.slice(0, 300),
                })),
                null, 2
              ),
            }],
          },
        })
      }
    }

    return NextResponse.json({ error: { code: -32601, message: `Unknown: ${method}` } }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: { code: -32603, message: 'Internal error' } }, { status: 500 })
  }
}
