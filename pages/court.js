// pages/court.js
(function () {
  const KEY = "concept_court_cases_v1";

  function $(sel) { return document.querySelector(sel); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function nowId(seed) {
    const n = Date.now().toString(36);
    return `CC-${seed.toString(16).slice(0,6)}-${n}`.toUpperCase();
  }

  function loadCases() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }
  function saveCases(cases) {
    localStorage.setItem(KEY, JSON.stringify(cases));
  }
  function upsertCase(caseObj) {
    const cases = loadCases();
    const idx = cases.findIndex(c => c.id === caseObj.id);
    if (idx >= 0) cases[idx] = caseObj; else cases.unshift(caseObj);
    saveCases(cases);
  }
  function getCase(id) {
    return loadCases().find(c => c.id === id) || null;
  }
  function deleteCase(id) {
    saveCases(loadCases().filter(c => c.id !== id));
  }

  function generateCharges(text, seed) {
    const t = text.trim();
    const hasMaybe = /可能|大概|也许|似乎|差不多/.test(t);
    const hasAbstract = /本质|意义|价值|系统|概念|真实|清晰|升级|边界/.test(t);
    const hasSelfRef = /这句话|本句|本概念|这个概念|本身/.test(t);

    const base = [
      "定义缺失：关键术语未被界定。",
      "边界不明：概念适用范围无法圈定。",
      "可证伪性不足：无法指出何时算不成立。",
      "偷换风险：同一词在不同句段可能指不同对象。",
      "指向过多：一句话承担了多种任务（描述/评价/命令混在一起）。",
      "可执行性不足：即使同意，也无法据此采取动作。"
    ];

    const s = seed % 97;
    const arr = base.map((x, i) => ({ x, k: (s + i * 17) % 101 }))
      .sort((a,b)=>a.k-b.k).map(o=>o.x);

    if (hasMaybe) arr.unshift("不确定性过载：语气回避导致判断无法落地。");
    if (hasAbstract) arr.unshift("抽象堆叠：抽象词连续出现，掩盖了对象。");
    if (hasSelfRef) arr.unshift("自指循环：概念用自身解释自身。");

    // 故意保留“撤回痕迹”
    arr.splice(3, 0, "撤回条款：以上指控可能成立；也可能只是措辞误伤。（保留）");

    return arr.slice(0, 8);
  }

  function extractEvidence(text) {
    const t = text.trim();
    const quotes = (t.match(/“[^”]{1,30}”|\"[^\"]{1,30}\"/g) || []).slice(0,3);
    const abstractHits = (t.match(/本质|意义|价值|系统|概念|真实|清晰|升级|边界/g) || []).slice(0,6);
    const pivots = (t.match(/但是|然而|不过|所以|因此|同时/g) || []).slice(0,6);

    return {
      quotes,
      abstractHits,
      pivots,
      note: "证据为文本表面提取；不保证指向真实对象。"
    };
  }

  function generateDefense(seed) {
    const pool = [
      "辩方陈述：该概念故意保持松散，以免过早收敛。",
      "辩方陈述：未定义不是缺陷，而是为了容纳多场景。",
      "辩方陈述：‘可执行性’要求属于过度工程化。",
      "辩方陈述：概念的作用是触发讨论，不是给出闭环方案。",
      "辩方陈述：所谓‘边界’是后验产物，前置边界会误杀可能性。"
    ];
    return pool[seed % pool.length] + "（本段可能在后续被撤回）";
  }

  function generateVerdict(seed, selectedCharges) {
    const score = selectedCharges.length;
    if (score >= 6) return "驳回（概念不成立 / 未达到受理条件）";
    if (score >= 3) return "附条件通过（需修正后复审）";
    return "通过（但保留撤回权）";
  }

  function generateRemedies() {
    return [
      "条款 1：选出一个核心术语，为其写一句排他定义（包含“不是什么”）。验收：他人能举出一个反例。",
      "条款 2：写出适用边界（至少一个“不适用场景”）。验收：边界句不含抽象词。",
      "条款 3：给出失败条件（何时算不成立）。验收：失败条件可被复述且不引入新概念。"
    ];
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function render() {
    const page = document.body.getAttribute("data-page") || "";
    const params = new URLSearchParams(location.search);
    const id = params.get("id");

    if (page === "lobby") {
      const form = $("#cc-form");
      const input = $("#cc-input");
      const recent = $("#cc-recent");
      if (!form || !input || !recent) return;

      const cases = loadCases().slice(0, 7);
      recent.innerHTML = cases.length
        ? `<ul>${cases.map(c => `<li><a href="pages/fp-05.html?id=${encodeURIComponent(c.id)}">${escapeHtml(c.id)}</a> — ${escapeHtml(c.verdict || "未判决")}</li>`).join("")}</ul>`
        : "<p>暂无案卷。</p>";

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        const seed = hash32(text);
        const cid = nowId(seed);

        const caseObj = {
          id: cid,
          text,
          seed,
          charges: generateCharges(text, seed),
          selectedCharges: [],
          evidence: extractEvidence(text),
          defense: generateDefense(seed),
          verdict: "",
          remedies: [],
          updatedAt: new Date().toISOString()
        };

        upsertCase(caseObj);
        location.href = `pages/fp-02.html?id=${encodeURIComponent(cid)}`;
      });
    }

    if (page === "charges") {
      const box = $("#cc-charges");
      const title = $("#cc-title");
      const btnNext = $("#cc-next");
      if (!box || !title || !btnNext) return;

      const c = id ? getCase(id) : null;
      if (!c) { box.innerHTML = "<p>未找到案卷。</p>"; return; }
      title.textContent = c.id;

      box.innerHTML = c.charges.map((ch, i) => {
        const checked = c.selectedCharges.includes(i) ? "checked" : "";
        return `<div><label><input type="checkbox" data-i="${i}" ${checked}> ${escapeHtml(ch)}</label></div>`;
      }).join("");

      box.addEventListener("change", (e) => {
        const t = e.target;
        if (t && t.matches("input[type=checkbox][data-i]")) {
          const i = Number(t.getAttribute("data-i"));
          const set = new Set(c.selectedCharges);
          if (t.checked) set.add(i); else set.delete(i);
          c.selectedCharges = Array.from(set).sort((a,b)=>a-b);
          c.updatedAt = new Date().toISOString();
          upsertCase(c);
        }
      });

      btnNext.addEventListener("click", () => {
        location.href = `fp-03.html?id=${encodeURIComponent(c.id)}`;
      });
    }

    if (page === "evidence") {
      const el = $("#cc-evidence");
      const title = $("#cc-title");
      const btnNext = $("#cc-next");
      if (!el || !title || !btnNext) return;

      const c = id ? getCase(id) : null;
      if (!c) { el.innerHTML = "<p>未找到案卷。</p>"; return; }
      title.textContent = c.id;

      const ev = c.evidence || {};
      el.innerHTML = `
        <p><strong>抽取证据（表面）</strong></p>
        <ul>
          <li>引号片段：${(ev.quotes||[]).map(escapeHtml).join(" / ") || "无"}</li>
          <li>抽象词命中：${(ev.abstractHits||[]).map(escapeHtml).join(" / ") || "无"}</li>
          <li>转折词：${(ev.pivots||[]).map(escapeHtml).join(" / ") || "无"}</li>
        </ul>
        <p>${escapeHtml(ev.note || "")}</p>
        <p>（引用：见 <a href="fp-04.html#testimony">证人证言</a> —— 可能不存在）</p>
      `;

      btnNext.addEventListener("click", () => {
        location.href = `fp-04.html?id=${encodeURIComponent(c.id)}`;
      });
    }

    if (page === "defense") {
      const el = $("#cc-defense");
      const title = $("#cc-title");
      const btnNext = $("#cc-next");
      if (!el || !title || !btnNext) return;

      const c = id ? getCase(id) : null;
      if (!c) { el.innerHTML = "<p>未找到案卷。</p>"; return; }
      title.textContent = c.id;

      el.innerHTML = `
        <p>${escapeHtml(c.defense || "")}</p>
        <p>（撤回权：本辩护可能在下一页被系统否定，但不会被删除。）</p>
      `;

      btnNext.addEventListener("click", () => {
        location.href = `fp-05.html?id=${encodeURIComponent(c.id)}`;
      });
    }

    if (page === "verdict") {
      const el = $("#cc-verdict");
      const title = $("#cc-title");
      const btnSave = $("#cc-save");
      const btnExport = $("#cc-export");
      if (!el || !title || !btnSave || !btnExport) return;

      const c = id ? getCase(id) : null;
      if (!c) { el.innerHTML = "<p>未找到案卷。</p>"; return; }
      title.textContent = c.id;

      const selected = (c.selectedCharges || []).map(i => c.charges[i]).filter(Boolean);
      c.verdict = generateVerdict(c.seed, selected);
      c.remedies = generateRemedies();

      el.innerHTML = `
        <p><strong>判决</strong>：${escapeHtml(c.verdict)}</p>
        <p><strong>已采纳指控</strong>：${selected.length ? "" : "（无）"}</p>
        <ul>${selected.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
        <p><strong>修正条款</strong>：</p>
        <ol>${c.remedies.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ol>
        <p>冻结声明：Freeze Count = 7. Expansion flagged.</p>
      `;

      btnSave.addEventListener("click", () => {
        c.updatedAt = new Date().toISOString();
        upsertCase(c);
        alert("已保存到案卷库（localStorage）。");
      });

      btnExport.addEventListener("click", () => {
        const txt =
`CASE ${c.id}
TEXT:
${c.text}

CHARGES (selected):
${selected.map(x => "- " + x).join("\n") || "(none)"}

EVIDENCE (surface):
- quotes: ${(c.evidence?.quotes||[]).join(" / ") || "none"}
- abstract: ${(c.evidence?.abstractHits||[]).join(" / ") || "none"}
- pivots: ${(c.evidence?.pivots||[]).join(" / ") || "none"}

DEFENSE:
${c.defense}

VERDICT:
${c.verdict}

REMEDIES:
${c.remedies.map((r,i)=>`${i+1}. ${r}`).join("\n")}

NOTE:
Retractions are preserved. Some references may be missing.
`;
        downloadText(`${c.id}.txt`, txt);
      });
    }

    if (page === "docket") {
      const el = $("#cc-docket");
      if (!el) return;

      const cases = loadCases();
      el.innerHTML = cases.length
        ? `<ul>${cases.map(c => `
            <li>
              <a href="fp-05.html?id=${encodeURIComponent(c.id)}">${escapeHtml(c.id)}</a>
              — ${escapeHtml(c.verdict || "未判决")}
              <button data-del="${escapeHtml(c.id)}">删除</button>
            </li>
          `).join("")}</ul>`
        : "<p>案卷库为空。</p>";

      el.addEventListener("click", (e) => {
        const b = e.target;
        if (b && b.matches("button[data-del]")) {
          const cid = b.getAttribute("data-del");
          deleteCase(cid);
          location.reload();
        }
      });
    }

    // fp-01 保留为“程序性残留页”，不用强绑定功能
  }

  document.addEventListener("DOMContentLoaded", render);
})();

