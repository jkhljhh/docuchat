import { NextRequest, NextResponse } from 'next/server'
import { parseDocument } from '@/lib/document-parser'
import { buildTreeIndex } from '@/lib/tree-index'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const allowed = ['pdf', 'txt', 'md', 'docx']
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !allowed.includes(ext))
      return NextResponse.json({ error: `Unsupported type. Allowed: ${allowed.join(', ')}` }, { status: 400 })

    if (file.size > 50 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large. Max 50MB.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const doc = await parseDocument(file, buffer)

    // Build the PageIndex tree
    const { tree, docDescription } = await buildTreeIndex(doc.pages, doc.name)

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        totalPages: doc.totalPages,
        fileSize: doc.fileSize,
        uploadedAt: doc.uploadedAt,
        docDescription,
        treeIndex: tree,
        pages: doc.pages,  // full pages stored client-side
      },
    })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to process document' },
      { status: 500 }
    )
  }
}
