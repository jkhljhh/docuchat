import type { DocumentPage, ProcessedDocument } from './types'
import { v4 as uuidv4 } from 'uuid'

const CHARS_PER_CHUNK = 3000

export async function parseDocument(file: File, buffer: Buffer): Promise<ProcessedDocument> {
  const ext = file.name.split('.').pop()?.toLowerCase() as 'pdf' | 'txt' | 'docx' | 'md'
  let pages: DocumentPage[] = []

  if (ext === 'pdf')             pages = await parsePDF(buffer)
  else if (ext === 'docx')       pages = await parseDOCX(buffer)
  else if (ext === 'txt' || ext === 'md') pages = parseText(buffer.toString('utf-8'))
  else throw new Error(`Unsupported file type: .${ext}`)

  if (pages.length === 0) throw new Error('Could not extract any text from the document.')

  return {
    id: uuidv4(),
    name: file.name,
    type: ext,
    totalPages: pages.length,
    pages,
    uploadedAt: new Date(),
    fileSize: file.size,
  }
}

async function parsePDF(buffer: Buffer): Promise<DocumentPage[]> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  const text = data.text?.trim() || ''

  if (text.length < 100) {
    // Image-based PDF — use LLM vision OCR
    return await ocrPDFWithVision(buffer)
  }

  const rawPages = text.split(/\f/)
  if (rawPages.length > 1) {
    return rawPages
      .map((c, i) => makePage(i + 1, c.trim()))
      .filter(p => p.content.length > 20)
  }
  return chunkText(text)
}

async function ocrPDFWithVision(buffer: Buffer): Promise<DocumentPage[]> {
  const { getLLMClient, getModel } = await import('./llm-client')
  const client = getLLMClient()
  const base64 = buffer.toString('base64')

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Extract ALL text from this PDF exactly as it appears. Preserve headings, paragraphs, tables, lists. Output only the text.' },
        { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } },
      ],
    }] as any,
    max_tokens: 8000,
    temperature: 0,
  })

  const text = response.choices[0]?.message?.content?.trim() || ''
  if (!text || text.length < 20) throw new Error('Vision OCR returned no text. The PDF may be password-protected.')
  return chunkText(text)
}

async function parseDOCX(buffer: Buffer): Promise<DocumentPage[]> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return chunkText(result.value)
}

function parseText(text: string): DocumentPage[] {
  return chunkText(text)
}

function chunkText(text: string): DocumentPage[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const paragraphs = clean.split('\n\n').filter(p => p.trim().length > 0)
  const pages: DocumentPage[] = []
  let current = ''
  let pageNum = 1

  for (const para of paragraphs) {
    if (current.length + para.length > CHARS_PER_CHUNK && current.length > 0) {
      pages.push(makePage(pageNum++, current.trim()))
      current = para
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }
  if (current.trim()) pages.push(makePage(pageNum, current.trim()))

  return pages.length > 0
    ? pages
    : [makePage(1, clean.slice(0, CHARS_PER_CHUNK))]
}

function makePage(pageNumber: number, content: string): DocumentPage {
  return {
    pageNumber,
    content,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    charCount: content.length,
  }
}
