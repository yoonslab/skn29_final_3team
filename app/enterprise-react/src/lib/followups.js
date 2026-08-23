// 응답 후 이어가기 좋은 후속 질문을 결정론적으로 생성한다(Perplexity related 스타일).

const PERIOD_RE = /(지난주|이번 달|저번 주|금주|최근\s?\d+일|\d{1,2}월)/;

// 받침 유무로 을/를을 고른다. 한글 음절(가-힣) 외에는 원문을 그대로 쓴다.
function objectParticle(word) {
  const last = String(word ?? "").trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "를" : "을";
  return "를";
}

export function buildFollowups(question, run) {
  const metrics = Array.isArray(run?.metrics) ? run.metrics : [];
  const sources = Array.isArray(run?.evidence?.sources) ? run.evidence.sources : [];
  const period = String(question ?? "").match(PERIOD_RE)?.[1] ?? "직전 기간";

  const out = [];

  const top = metrics[0];
  if (top) {
    const label = top.label ?? top.metric_id;
    out.push(`${label}${objectParticle(label)} ${period} 이전과 비교해줘`);
  }

  if (sources[0]) {
    const name = sources[0].name ?? sources[0].fqn;
    out.push(`${name} 데이터에서 다른 확인할 만한 지표를 보여줘`);
  }

  if (metrics.length >= 2) {
    const a = metrics[0]?.label ?? "첫 번째 지표";
    const b = metrics[1]?.label ?? "두 번째 지표";
    out.push(`${a}${a.slice(-1).charCodeAt(0)%28===0?"와":"과"} ${b}의 관계를 요약해줘`);
  } else {
    out.push("이 결과를 리포트 초안으로 정리해줘");
  }

  return dedupe(out).slice(0, 3);
}

function dedupe(list) {
  return [...new Set(list.filter(Boolean))];
}
