/**
 * Vite 中间件：/api/resolve-molecule
 * 用 DeepSeek 把日常用语解析成化学成分列表（含现实百分比估算）
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

const REACTION_SYSTEM_PROMPT = `你是严谨的化学反应判定助手。根据给定反应物与实验条件判断是否发生化学反应。
只输出 JSON，不要 markdown。必须使用下列格式：
{"ok":true,"reacts":true,"equation":"配平后的 ASCII 化学方程式，例如 2H2 + O2 -> 2H2O","condition":"实际使用或必须补充的条件","reason":"简短说明","products":[{"name_zh":"水","name_en":"water","formula":"H2O","smiles":"O","role":"产物/现象"}]}
无反应或条件不足：{"ok":true,"reacts":false,"reason":"原因及建议条件","condition":"...","equation":"","products":[]}
规则：方程式必须守恒且配平；products 只列右侧实际产物；每个产物均须提供 PubChem 可检索的英文名和分子式；不确定时返回 reacts:false，绝不臆造反应。`

const SYSTEM_PROMPT = `你是化学与配方分析助手。把用户描述的日常物品、食品饮料、材料、药品等解析成可在 PubChem 检索的**纯化学分子**清单。

规则：
1. 只输出一个 JSON 对象，不要 markdown，不要其它文字。
2. 混合物/商品（如可口可乐、酱油、空气、牛奶、糖浆）必须拆成多种**单一纯分子**，给出典型现实质量/体积百分比估算。
3. 单一纯净物则 components 仅一项，percent 为 100。
4. 百分比为公开资料或教科书中的典型估算，总和尽量接近 100；微量成分可合并或省略。
5. 每个成分必须给出 PubChem 友好的英文名 name_en，以及尽量给出 formula 与 smiles。
6. **禁止**把中间混合物/商品名当作成分，例如：
   - 禁止：高果糖玉米糖浆 / HFCS / corn syrup / 淀粉糖浆 / 植物油 / 蛋白质 / 脂肪 / 空气（整项）
   - 必须拆到纯分子：fructose、glucose、water、sucrose、oleic acid、nitrogen、oxygen 等
7. 聚合物/生物大分子用常见小分子代表并在 role 中注明，例如淀粉→glucose，蛋白质→glycine 或常见氨基酸。
8. 优先常见小分子（无机盐、单糖、有机酸、气体、溶剂），避免无法查 3D 结构的模糊条目。
9. 无法对应化学物质时：{"ok":false,"reason":"简短原因"}

成功 JSON：
{
  "ok": true,
  "kind": "mixture" 或 "pure",
  "product_zh": "中文物品名",
  "product_en": "English name",
  "note": "说明百分比为典型估算原型，非厂商精确配方",
  "reason": "一句话总述",
  "components": [
    {
      "name_zh": "水",
      "name_en": "water",
      "formula": "H2O",
      "smiles": "O",
      "percent": 89.0,
      "role": "溶剂"
    }
  ]
}

components 按 percent 从高到低排序，至少 1 项；混合物建议 3–8 项纯分子。`

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<any>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {string} text
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') throw new Error('模型返回为空')
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) {
      try { return JSON.parse(fenced[1].trim()) } catch {}
    }
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)) } catch {}
    }
    throw new Error('无法解析模型返回的 JSON')
  }
}

/**
 * @param {{ apiKey: string, model: string }} options
 */
export function deepseekPlugin(options) {
  const { apiKey, model } = options

  /**
   * @param {import('vite').Connect.Server} middlewares
   */
  function attach(middlewares) {
    middlewares.use(async (req, res, next) => {
      const isMolecule = req.url?.startsWith('/api/resolve-molecule')
      const isReaction = req.url?.startsWith('/api/resolve-reaction')
      if (!isMolecule && !isReaction) return next()

      res.setHeader('Content-Type', 'application/json; charset=utf-8')

      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      if (!apiKey) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: '未配置 DEEPSEEK_API_KEY，请在项目根目录 .env 中设置' }))
        return
      }

      try {
        const body = await readJsonBody(req)
        const query = String(body.query || '').trim()
        const reactants = Array.isArray(body.reactants) ? body.reactants.map((x) => String(x || '').trim()).filter(Boolean) : []
        if (isMolecule && !query) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: '缺少 query' }))
          return
        }
        if (isReaction && reactants.length < 2) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: '至少需要两种反应物' }))
          return
        }
        const reactionRequest = `【反应物】：${reactants.join(' + ')}\n【用户选择条件】：${String(body.condition || '未指定')}\n请严格按反应 JSON 契约返回。`

        const upstream = await fetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || 'deepseek-v4-flash',
            temperature: 0.2,
            max_tokens: 1500,
            // V4 默认开启 thinking，会先生成大量 reasoning_tokens 再出答案，体感比网页聊天慢很多。
            // 成分拆解是结构化抽取任务，关闭思考即可接近网页“非深度思考”速度。
            thinking: { type: 'disabled' },
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: isReaction ? REACTION_SYSTEM_PROMPT : SYSTEM_PROMPT },
              {
                role: 'user',
                content: isReaction ? reactionRequest : `【待拆解目标物品/表达】：${query}\n请按规范严格只输出包含 "ok": true 和 "components" 数组的 JSON 对象：`,
              },
            ],
          }),
        })

        const data = await upstream.json().catch(() => ({}))
        if (!upstream.ok) {
          const msg = data?.error?.message || data?.message || `AI HTTP ${upstream.status}`
          res.statusCode = upstream.status === 401 ? 401 : 502
          res.end(JSON.stringify({ error: msg }))
          return
        }

        const msgObj = data?.choices?.[0]?.message
        const content = (msgObj?.content || msgObj?.reasoning_content || '').trim()
        const parsed = extractJson(content)

        res.statusCode = 200
        res.end(
          JSON.stringify({
            ...parsed,
            model: data?.model || model,
            raw: content,
          }),
        )
      } catch (err) {
        console.error('[deepseek]', err)
        res.statusCode = 500
        res.end(JSON.stringify({ error: err.message || '解析失败' }))
      }
    })
  }

  return {
    name: 'deepseek-resolve-molecule',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
