import OpenAI from 'openai'

export function getLLMClient(): OpenAI {
  // Priority: Groq → xAI (Grok) → OpenAI
  if (process.env.GROQ_API_KEY) {
    return new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }
  if (process.env.XAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1',
    })
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
}

export function getModel(): string {
  if (process.env.GROQ_API_KEY) return 'llama-3.3-70b-versatile'
  if (process.env.XAI_API_KEY)  return 'grok-4-latest'
  return 'gpt-4o-mini'
}
