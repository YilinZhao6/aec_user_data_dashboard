// What makes up a score: every item with its value, lines, colour, weight and
// points. Opened from a card in ScoreCards.

import { CATEGORIES, CATEGORY_WEIGHTS, ERROR_TYPES, PROBE_EXPLAINER, SCORE_BANDS } from './healthScoring'
import { modelLabel, routeLabel, siteLabel } from './healthMeta'
import { clock, formatValue, GRADE_LABEL, thresholdText } from './healthFormat'
import { HelpMark, Light } from './HealthBits'

const pctOf = (share) => `${Math.round(share * 100)}%`

function ItemsTable({ items }) {
  return (
    <div className="sample4-table-wrap">
      <table className="sample4-table mh-items mh-stack">
        <thead>
          <tr>
            <th>细项</th>
            <th>现在</th>
            <th>状态</th>
            <th>黄线</th>
            <th>红线</th>
            <th>占这个分</th>
            <th>满分 → 零分</th>
            <th>得分</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.def.id} className={item.grade === 'red' ? 'mh-row-red' : undefined}>
              <td className="mh-item-name">
                <span>
                  {item.def.label}
                  {item.def.hard && <em className="mh-tag mh-tag-hard">一票变红</em>}
                </span>
                <small>{item.def.help}</small>
              </td>
              <td data-label="现在" className={`mh-num mh-text-${item.grade}`}>{formatValue(item.def.unit, item.value)}</td>
              <td data-label="状态"><Light grade={item.grade} /></td>
              <td data-label="黄线" className="mh-muted">{thresholdText(item.def, 'yellow')}</td>
              <td data-label="红线" className="mh-muted">{thresholdText(item.def, 'red')}</td>
              <td data-label="占这个分" className="mh-num">{item.score == null ? <span className="mh-muted">不计</span> : pctOf(item.share)}</td>
              <td data-label="满分 → 零分" className="mh-muted mh-nowrap">{formatValue(item.def.unit, item.def.full)} → {formatValue(item.def.unit, item.def.zero)}</td>
              <td data-label="得分" className="mh-num">{item.score ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ErrorMix({ metrics }) {
  const total = metrics.counts.rawErrors
  if (!total) return <p className="mh-muted">这一格没有第一次就失败的请求。</p>
  return (
    <div className="mh-errmix">
      <div className="mh-errbar" aria-hidden="true">
        {ERROR_TYPES.map((t) =>
          metrics.errorsByType[t.id] ? (
            <span key={t.id} className={`mh-err-${t.id}`} style={{ flexGrow: metrics.errorsByType[t.id] }} />
          ) : null,
        )}
      </div>
      <ul className="mh-errlist">
        {ERROR_TYPES.map((t) => (
          <li key={t.id}>
            <i className={`mh-err-${t.id}`} />
            {t.label}
            <b>{metrics.errorsByType[t.id].toLocaleString()}</b>
            <span>{pctOf(metrics.errorsByType[t.id] / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProbeDots({ probe }) {
  if (!probe) return <p className="mh-muted">这个筛选下没有探测目标（探测只测 Gemini 两个模型 × 两条线路）。</p>
  return (
    <div className="mh-probes">
      {probe.targets.map((t) => (
        <div key={`${t.model}|${t.route}`} className="mh-probe-row">
          <span>{modelLabel(t.model)} · {routeLabel(t.route)}</span>
          {t.results ? (
            <span className="mh-probe-dots">
              {t.results.map((r, i) => (
                <i
                  key={i}
                  className={`mh-dot mh-${r.ok ? (r.ttftMs > 3000 ? 'yellow' : 'green') : 'red'}`}
                  title={`${clock(r.at)} ${r.ok ? `正常，首 token ${(r.ttftMs / 1000).toFixed(1)} 秒` : '失败'}`}
                />
              ))}
            </span>
          ) : (
            <span className="mh-muted">{t.ok}/{t.calls} 次正常{t.maxFailStreak >= 3 ? `，最多连续 ${t.maxFailStreak} 次失败` : ''}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function WorstSite({ label, worst, unit = 'ms' }) {
  if (!worst) return null
  return (
    <p className="mh-muted">
      {label}最差的是 {siteLabel(worst.site)}：p90 {formatValue(unit, worst.p90)}，是基线的 {formatValue('x', worst.value)}。
    </p>
  )
}

function OverallDetail({ bucket }) {
  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)
  return (
    <>
      <div className="sample4-table-wrap">
        <table className="sample4-table mh-items mh-stack">
          <thead>
            <tr>
              <th>类别</th>
              <th>分数</th>
              <th>状态</th>
              <th>权重</th>
              <th>触发的规则</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const cat = bucket.categories[c.id]
              const rules = [
                ...cat.hard.map((i) => `一票变红：${i.def.label}`),
                ...cat.raised.filter((i) => !i.hardHit).map((i) => `至少黄：${i.def.label}`),
              ]
              return (
                <tr key={c.id}>
                  <td><b>{c.label}</b></td>
                  <td data-label="分数" className={`mh-num mh-text-${cat.grade}`}>{cat.score ?? '—'}</td>
                  <td data-label="状态"><Light grade={cat.grade} /></td>
                  <td data-label="权重" className="mh-num">{pctOf(CATEGORY_WEIGHTS[c.id] / totalWeight)}</td>
                  <td data-label="触发的规则" className="mh-muted">{rules.join('；') || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mh-formula">
        总健康分 = 速度 × {CATEGORY_WEIGHTS.speed}% + 可用性 × {CATEGORY_WEIGHTS.availability}% + 兜底 × {CATEGORY_WEIGHTS.fallback}%（某一类数据不足时，按剩下的重新分）。
        任一类触发一票变红，总分直接红；任一类是红或被规则拉到黄，总分至少黄。
      </p>
    </>
  )
}

export function CategoryDetail({ open, bucket, bucketText }) {
  const isOverall = open === 'overall'
  const category = isOverall ? null : bucket.categories[open]
  const label = isOverall ? '总健康分' : CATEGORIES.find((c) => c.id === open).label
  const head = isOverall ? bucket.overall : category

  return (
    <section id="mh-detail" className={`sample4-panel mh-detail mh-edge-${head.grade}`}>
      <div className="mh-detail-head">
        <div>
          <span className="mh-eyebrow">{bucketText}</span>
          <h2>
            {label} <span className={`mh-text-${head.grade}`}>{head.score ?? '—'}</span>
            <Light grade={head.grade}>{GRADE_LABEL[head.grade]}</Light>
          </h2>
        </div>
        <span className="mh-muted">
          ≥ {SCORE_BANDS.green} 绿，{SCORE_BANDS.yellow}–{SCORE_BANDS.green - 1} 黄，&lt; {SCORE_BANDS.yellow} 红
        </span>
      </div>

      {isOverall ? (
        <OverallDetail bucket={bucket} />
      ) : (
        <>
          <ItemsTable items={category.items} />
          <p className="mh-formula">
            {label}分 = 各细项得分按「占这个分」加权平均。每项在「满分」那条线拿 100、到「零分」那条线拿 0，中间按比例；数据不足的项不计，
            它的权重分给其他项。标了「一票变红」的项变红时，这张卡直接红；任何一项红，这张卡至少黄。
          </p>

          {open === 'speed' && (
            <div className="mh-detail-extra">
              <WorstSite label="批处理类首 token：" worst={bucket.metrics.batchTtftWorst} />
              <WorstSite label="总耗时：" worst={bucket.metrics.totalWorst} />
            </div>
          )}

          {open === 'availability' && (
            <div className="mh-detail-extra mh-detail-split">
              <div>
                <h3 className="mh-h3">原始错误按类型</h3>
                <ErrorMix metrics={bucket.metrics} />
              </div>
              <div>
                <h3 className="mh-h3">
                  主动探测 <HelpMark text={PROBE_EXPLAINER} />
                </h3>
                <p className="mh-explainer">{PROBE_EXPLAINER}</p>
                <ProbeDots probe={bucket.metrics.probe} />
              </div>
            </div>
          )}

          {open === 'fallback' && (
            <p className="mh-muted mh-detail-extra">
              这一格兜底 {bucket.metrics.counts.fallbacks.toLocaleString()} 次，救回 {bucket.metrics.counts.fb_rescued.toLocaleString()} 次；
              重试 {bucket.metrics.counts.retries.toLocaleString()} 次。
            </p>
          )}
        </>
      )}
    </section>
  )
}
