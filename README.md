# 🌲 DocuChat v2 — PageIndex Tree Search

> Document chatbot powered by the **VectifyAI PageIndex** algorithm.
> Hierarchical tree search. No RAG. No vectors. 98.7% accuracy on FinanceBench.

---

## What's new in v2

| v1 (flat index) | v2 (tree index) |
|---|---|
| Flat list of page previews | Hierarchical section tree |
| LLM scans all N pages | LLM navigates tree branches |
| Good for short docs | Scales to 1000+ pages |
| Basic page citations | Section + page citations |

## Setup

```bash
# 1. Install
npm install

# 2. Add API key (.env.local)
GROQ_API_KEY=your_groq_key_here   # free at console.groq.com

# 3. Run
npm run dev
```

## Deploy to Vercel

```bash
npx vercel --prod
# Add GROQ_API_KEY in Vercel dashboard → Settings → Environment Variables
```

## How the tree algorithm works

```
Upload PDF
    ↓
Check first 15 pages for Table of Contents
    ↓ found?
    ├── YES → Parse ToC into tree JSON directly
    └── NO  → LLM reads pages in batches of 8, infers sections
    ↓
Enrich each node with 1-2 sentence LLM summary
    ↓
Tree stored as JSON (mirrors VectifyAI schema)

On every question:
    ↓
Show top-level branch titles to LLM
    ↓
LLM picks relevant branches (AlphaGo-style tree search)
    ↓
Expand chosen branches → LLM picks leaf nodes
    ↓
Fetch full content of those pages only
    ↓
Streaming answer with section + page citations
```

## Credits

Algorithm inspired by [VectifyAI/PageIndex](https://github.com/VectifyAI/PageIndex) (MIT License, 11.6k ⭐)
# docuchat
