/**
 * 压测：DeepSeek（完整 system prompt）+ PubChem 各阶段耗时
 * 运行：node scripts/bench-latency.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// 从 plugin 源码抽出 SYSTEM_PROMPT 文本（避免重复维护）
const pluginSrc = readFileSync(resolve(root, 'server/deepseekPlugin.js'), 'utf8')
const m = pluginSrc.match(/const SYSTEM_PROMPT = `([\s\S]*?)`/)
const SYSTEM_PROMPT = m ? m[1] : '你是化学助手，只输出 JSON。'

function mark(label, start) {
  const ms = Math.round(performance.now() - start)
  console.log(JSON.stringify({ stage: label, ms }))
  return performance.now()
}

async function benchPubChem(name) {
  const totalStart = performance.now()
  let s = performance.now()
  const cidRes = await fetch(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`,
  )
  const cidJson = await cidRes.json()
  const cid = cidJson?.IdentifierList?.CID?.[0]
  s = mark(`pubchem_name_to_cid(${name})`, s)
  if (!cid) {
    console.log(JSON.stringify({ stage: `pubchem_${name}`, error: 'no cid' }))
    return null
  }

  const structStart = performance.now()
  const [sdfRes, propsRes] = await Promise.all([
    fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`,
    ),
    fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES/JSON`,
    ),
  ])
  const sdf = await sdfRes.text()
  await propsRes.json()
  mark(`pubchem_sdf3d_plus_props(${name})`, structStart)
  const total = Math.round(performance.now() - totalStart)
  console.log(JSON.stringify({ name, cid, sdfBytes: sdf.length, pubchem_total_ms: total }))
  return { cid, sdf, total }
}

async function benchDeepSeek(query, key, model, thinking = { type: 'disabled' }) {
  const start = performance.now()
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-v4-flash',
      temperature: 0.2,
      max_tokens: 1500,
      thinking,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `【待拆解目标物品/表达】：${query}\n请按规范严格只输出包含 "ok": true 和 "components" 数组的 JSON 对象：`,
        },
      ],
    }),
  })
  const json = await res.json()
  const ms = Math.round(performance.now() - start)
  const content = (json?.choices?.[0]?.message?.content || '').trim()
  const thinkLabel = thinking?.type || 'default'
  console.log(
    JSON.stringify({
      stage: `deepseek(${query}, thinking=${thinkLabel})`,
      ms,
      httpStatus: res.status,
      model: json?.model || model,
      usage: json?.usage,
      contentLen: content.length,
      contentPreview: content.slice(0, 120).replace(/\s+/g, ' '),
      error: json?.error?.message,
    }),
  )
  return { ms, content }
}

const envText = readFileSync(resolve(root, '.env'), 'utf8')
const key = (envText.match(/DEEPSEEK_API_KEY=(.+)/) || [])[1]?.trim()
const model =
  (envText.match(/DEEPSEEK_MODEL=(.+)/) || [])[1]?.trim() || 'deepseek-v4-flash'

const t0 = performance.now()
console.log(
  JSON.stringify({
    stage: 'start',
    model,
    hasKey: Boolean(key),
    systemPromptChars: SYSTEM_PROMPT.length,
  }),
)

// 直查路径（英文名，跳过 AI）
const water = await benchPubChem('water')
await benchPubChem('glucose')

// AI 路径：对比默认 thinking vs 关闭 thinking
if (key) {
  console.log(JSON.stringify({ note: '对比：thinking enabled(默认) vs disabled' }))
  await benchDeepSeek('水', key, model, { type: 'enabled' })
  await benchDeepSeek('水', key, model, { type: 'disabled' })
  await benchDeepSeek('可口可乐', key, model, { type: 'enabled' })
  await benchDeepSeek('可口可乐', key, model, { type: 'disabled' })
  if (water) {
    console.log(
      JSON.stringify({
        note: 'WebGL/3Dmol loadSdf+双rAF fit 通常约 16~50ms；PubChem 另计',
        after_ai_to_pubchem_estimate_ms: water.total,
      }),
    )
  }
}

console.log(JSON.stringify({ stage: 'total_script', ms: Math.round(performance.now() - t0) }))
