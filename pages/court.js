// pages/court.js
(function () {
  const KEY = "concept_court_cases_v2";
  const LAST_KEY = "concept_court_last_case_v2";

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
    try { localStorage.setItem(KEY, JSON.stringify(cases)); } catch {}
  }
  function setLastCaseId(id) {
    try { localStorage.setItem(LAST_KEY, id); } catch {}
  }
  function getLastCaseId() {
    try { return localStorage.getItem(LAST_KEY) || ""; } catch { return ""; }
  }

  function upsertCase(caseObj) {
    const cases = loadCases();
    const idx = cases.findIndex(c => c.id === caseObj.id);
    if (idx >= 0) cases[idx] = caseObj;
    else cases.unshift(caseObj);
    saveCases(cases);
    setLastCaseId(caseObj.id);
  }

  function getCase(id) {
    return loadCases().find(c => c.id === id) || null;
  }

  function deleteCase(id) {
    saveCases(loadCases().filter(c => c.id !== id));
    const last = getLastCaseId();
    if (last === id) setLastCaseId("");
  }

  function mkChargeId(seed, text) {
    return "CH-" + (hash32(seed + "::" + text).toString(16)).slice(0,10).toUpperCase();
  }

  // --- generation (ruleful but keeps "retraction trace")
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
      .sort((a,b)=>a.k-b.k)
      .map(o=>o.x);

    if (hasMaybe) arr.unshift("不确定性过载：语气回避导致判断无法落地。");
    if (hasAbstract) arr.unshift("抽象堆叠：抽象词连续出现，掩盖了对象。");
    if (hasSelfRef) arr.unshift("自指循环：概念用自身解释自身。");

    arr.splice(3, 0, "撤回条款：以上指控可能成立；也可能只是措辞误伤。（保留）");

    // convert to objects with ids
    return arr.slice(0, 8).map(ch => ({ id: mkChargeId(String(seed), ch), text: ch, kind: "system" }));
  }

  function extractEvidence(text) {
    const t = text.trim();
    const quotes = (t.match(/“[^”]{1,40}”|\"[^\"]{1,40}\"/g) || []).slice(0,3);
    const abstractHits = (t.match(/本质|意义|价值|系统|概念|真实|清晰|升级|边界/g) || []).slice(0,8);
    const pivots = (t.match(/但是|然而|不过|所以|因此|同时/g) || []).slice(0,8);

    // suspicious tokens (very rough)
    const suspects = [];
    if (abstractHits.length) suspects.push("抽象词命中");
    if (quotes.length) suspects.push("引号片段");
    if (pivots.length) suspects.push("转折结构");
    if (!suspects.length) suspects.push("无明显线索（可能更危险）");

    return {
      quotes,
      abstractHits,
      pivots,
      suspects,
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

  function verdictFromScore(score) {
    if (score >= 6) return { text: "驳回（概念不成立 / 未达到受理条件）", level: "bad" };
    if (score >= 3) return { text: "附条件通过（需修正后复审）", level: "warn" };
    return { text: "通过（但保留撤回权）", level: "good" };
  }

  function remedies() {
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

  function renderRescue(metaEl, inPagesFolder) {
    const last = getLastCaseId();
    const back = inPagesFolder ? "../index.html" : "index.html";
    const docket = inPagesFolder ? "fp-06.html" : "pages/fp-06.html";
    const cont = inPagesFolder
      ? (last ? ` / <a href="fp-05.html?id=${encodeURIComponent(last)}">继续上一案</a>` : "")
      : (last ? ` / <a href="pages/fp-05.html?id=${encodeURIComponent(last)}">继续上一案</a>` : "");

    metaEl.innerHTML = `
      <div class="item">
        <p><strong>未找到案卷或缺少参数。</strong></p>
        <p class="muted">系统拒绝猜测，但允许继续。</p>
        <p><a href="${back}">回入口</a>${cont} / <a href="${docket}">案卷库</a></p>
      </div>
    `;
  }

  function renderMeta(metaEl, c) {
    metaEl.innerHTML = `
      <div class="kv">
        <span>CASE: ${escapeHtml(c.id)}</span>
        <span>UPDATED: ${escapeHtml((c.updatedAt || "").slice(0,19).replace("T"," "))}</span>
        <span>FREEZE: 7</span>
      </div>
      <div class="hr"></div>
      <p><strong>概念文本</strong></p>
      <div class="item"><span style="font-family:var(--mono)">${escapeHtml(c.text)}</span></div>
    `;
  }

  // --- render pages
  function render() {
    const page = document.body.getAttribute("data-page") || "";
    const params = new URLSearchParams(location.search);
    const id = params.get("id");

    // Lobby (index)
    if (page === "lobby") {
      const form = $("#cc-form");
      const input = $("#cc-input");
      const recent = $("#cc-recent");
      const lastBox = $("#cc-last");
      if (!form || !input || !recent) return;

      const last = getLastCaseId();
      if (lastBox) {
        lastBox.innerHTML = last
          ? `<p><a href="pages/fp-05.html?id=${encodeURIComponent(last)}">${escapeHtml(last)}</a></p>`
          : `<p class="muted">暂无。</p>`;
      }

      const cases = loadCases().slice(0, 7);
      recent.innerHTML = cases.length
        ? `<ul class="list">${cases.map(c => `
            <li class="item">
              <div class="row">
                <div class="grow">
                  <div><a href="pages/fp-05.html?id=${encodeURIComponent(c.id)}">${escapeHtml(c.id)}</a></div>
                  <small>${escapeHtml(c.verdictText || "未判决")}</small>
                </div>
                <span class="pill ${escapeHtml(c.verdictLevel || "warn")}">${escapeHtml(c.verdictLevel || "—")}</span>
              </div>
            </li>
          `).join("")}</ul>`
        : `<p class="muted">暂无案卷。</p>`;

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
          systemCharges: generateCharges(text, seed),
          customCharges: [],
          selectedChargeIds: [],
          evidence: extractEvidence(text),
          defense: generateDefense(seed),
          verdictText: "",
          verdictLevel: "",
          remedies: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        upsertCase(caseObj);
        location.href = `pages/fp-02.html?id=${encodeURIComponent(cid)}`;
      });

      return;
    }

    // --- pages/* (charges/evidence/defense/verdict/docket)
    const inPagesFolder = true;

    if (page === "charges") {
      const title = $("#cc-title");
      const meta = $("#cc-meta");
      const box = $("#cc-charges");
      const addInput = $("#cc-add");
      const addBtn = $("#cc-add-btn");
      const btnNext = $("#cc-next");

      if (!title || !box || !btnNext) return;

      const c = id ? getCase(id) : null;
      if (!c) { if (meta) renderRescue(meta, inPagesFolder); return; }
      title.textContent = c.id;
      if (meta) renderMeta(meta, c);

      // ensure arrays exist
      c.customCharges = c.customCharges || [];
      c.selectedChargeIds = c.selectedChargeIds || [];

      function renderCharges() {
        const all = [...(c.systemCharges || []), ...(c.customCharges || [])];

        box.innerHTML = all.map(ch => {
          const checked = c.selectedChargeIds.includes(ch.id) ? "checked" : "";
          const kindLabel = ch.kind === "custom" ? "CUSTOM" : "SYSTEM";
          const kindPill = ch.kind === "custom" ? "pill warn" : "pill";
          const tools = ch.kind === "custom"
            ? `<div class="tools"><button class="danger" data-del="${escapeHtml(ch.id)}" type="button">删除该自定义指控</button></div>`
            : "";
          return `
            <div class="item">
              <label>
                <input type="checkbox" data-id="${escapeHtml(ch.id)}" ${checked} />
                ${escapeHtml(ch.text)}
              </label>
              <div class="row" style="margin-top:8px">
                <span class="${kindPill}">${kindLabel}</span>
                <small>${escapeHtml(ch.id)}</small>
              </div>
              ${tools}
            </div>
          `;
        }).join("");
      }

      renderCharges();

      box.addEventListener("change", (e) => {
        const t = e.target;
        if (t && t.matches("input[type=checkbox][data-id]")) {
          const cid2 = t.getAttribute("data-id");
          const set = new Set(c.selectedChargeIds);
          if (t.checked) set.add(cid2); else set.delete(cid2);
          c.selectedChargeIds = Array.from(set);
          c.updatedAt = new Date().toISOString();
          upsertCase(c);
        }
      });

      box.addEventListener("click", (e) => {
        const b = e.target;
        if (b && b.matches("button[data-del]")) {
          const delId = b.getAttribute("data-del");
          c.customCharges = (c.customCharges || []).filter(x => x.id !== delId);
          c.selectedChargeIds = (c.selectedChargeIds || []).filter(x => x !== delId);
          c.updatedAt = new Date().toISOString();
          upsertCase(c);
          renderCharges();
        }
      });

      if (addBtn && addInput) {
        addBtn.addEventListener("click", () => {
          const txt = (addInput.value || "").trim();
          if (!txt) return;
          const obj = { id: mkChargeId(String(c.seed), "CUSTOM::" + txt), text: txt, kind: "custom" };
          // prevent duplicates
          const exists = (c.customCharges || []).some(x => x.id === obj.id);
          if (!exists) c.customCharges.push(obj);
          addInput.value = "";
          c.updatedAt = new Date().toISOString();
          upsertCase(c);
          renderCharges();
        });
      }

      btnNext.addEventListener("click", () => {
        location.href = `fp-03.html?id=${encodeURIComponent(c.id)}`;
      });

      return;
    }

    if (page === "evidence") {
      const title = $("#cc-title");
      const meta = $("#cc-meta");
      const el = $("#cc-evidence");
      const btnNext = $("#cc-next");

      if (!title || !el || !btnNext) return;

      const c = id ? getCase(id) : null;
      if (!c) { if (meta) renderRescue(meta, inPagesFolder); return; }
      title.textContent = c.id;
      if (meta) renderMeta(meta, c);

      const ev = c.evidence || {};
      const suspects = (ev.suspects || []).map(s => `<span class="pill warn">${escapeHtml(s)}</span>`).join(" ");

      el.innerHTML = `
        <div class="card">
          <h3>抽取证据（表面）</h3>
          <div class="row">${suspects || ""}</div>
          <div class="hr"></div>
          <ul class="list">
            <li class="item"><strong>引号片段</strong><div class="muted">${(ev.quotes||[]).map(escapeHtml).join(" / ") || "无"}</div></li>
            <li class="item"><strong>抽象词命中</strong><div class="muted">${(ev.abstractHits||[]).map(escapeHtml).join(" / ") || "无"}</div></li>
            <li class="item"><strong>转折词</strong><div class="muted">${(ev.pivots||[]).map(escapeHtml).join(" / ") || "无"}</div></li>
          </ul>
          <p class="muted">${escapeHtml(ev.note || "")}</p>
          <p class="muted">引用：见 <a href="fp-04.html#testimony">证人证言</a>（可能不存在）</p>
        </div>
      `;

      btnNext.addEventListener("click", () => {
        location.href = `fp-04.html?id=${encodeURIComponent(c.id)}`;
      });

      return;
    }

    if (page === "defense") {
      const title = $("#cc-title");
      const meta = $("#cc-meta");
      const el = $("#cc-defense");
      const btnNext = $("#cc-next");

      if (!title || !el || !btnNext) return;

      const c = id ? getCase(id) : null;
      if (!c) { if (meta) renderRescue(meta, inPagesFolder); return; }
      title.textContent = c.id;
      if (meta) renderMeta(meta, c);

      el.innerHTML = `
        <div class="card">
          <h3>辩护陈述</h3>
          <div class="item"><span style="font-family:var(--mono)">${escapeHtml(c.defense || "")}</span></div>
          <p class="muted">撤回权：本辩护可能在下一页被系统否定，但不会被删除。</p>
        </div>
      `;

      btnNext.addEventListener("click", () => {
        location.href = `fp-05.html?id=${encodeURIComponent(c.id)}`;
      });

      return;
    }

    if (page === "verdict") {
      const title = $("#cc-title");
      const meta = $("#cc-meta");
      const el = $("#cc-verdict");
      const btnSave = $("#cc-save");
      const btnExport = $("#cc-export");
      const btnBack = $("#cc-back");

      if (!title || !el || !btnSave || !btnExport) return;

      const c = id ? getCase(id) : null;
      if (!c) { if (meta) renderRescue(meta, inPagesFolder); return; }
      title.textContent = c.id;
      if (meta) renderMeta(meta, c);

      const all = [...(c.systemCharges || []), ...(c.customCharges || [])];
      const selected = (c.selectedChargeIds || [])
        .map(cid2 => all.find(x => x.id === cid2))
        .filter(Boolean);

      const v = verdictFromScore(selected.length);
      c.verdictText = v.text;
      c.verdictLevel = v.level;
      c.remedies = remedies();
      c.updatedAt = new Date().toISOString();
      upsertCase(c);

      el.innerHTML = `
        <div class="card">
          <div class="row">
            <h3 style="margin:0">判决</h3>
            <span class="pill ${escapeHtml(v.level)}">${escapeHtml(v.level)}</span>
          </div>
          <div class="item"><strong>${escapeHtml(v.text)}</strong></div>

          <div class="hr"></div>

          <h3>采纳指控（${selected.length}）</h3>
          ${selected.length ? `<ul class="list">${selected.map(s => `
            <li class="item">
              <div>${escapeHtml(s.text)}</div>
              <small>${escapeHtml(s.kind.toUpperCase())} / ${escapeHtml(s.id)}</small>
            </li>
          `).join("")}</ul>` : `<p class="muted">（无）</p>`}

          <div class="hr"></div>

          <h3>修正条款</h3>
          <ol class="list">${(c.remedies||[]).map(r => `<li class="item">${escapeHtml(r)}</li>`).join("")}</ol>

          <div class="hr"></div>

          <p class="muted">冻结声明：Freeze Count = 7. Expansion flagged.</p>
        </div>
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
${selected.map(x => "- " + x.text).join("\n") || "(none)"}

EVIDENCE (surface):
- quotes: ${(c.evidence?.quotes||[]).join(" / ") || "none"}
- abstract: ${(c.evidence?.abstractHits||[]).join(" / ") || "none"}
- pivots: ${(c.evidence?.pivots||[]).join(" / ") || "none"}

DEFENSE:
${c.defense}

VERDICT:
${c.verdictText}

REMEDIES:
${(c.remedies||[]).map((r,i)=>`${i+1}. ${r}`).join("\n")}

NOTE:
Retractions are preserved. Some references may be missing.
`;
        downloadText(`${c.id}.txt`, txt);
      });

      if (btnBack) {
        btnBack.addEventListener("click", () => {
          location.href = `fp-02.html?id=${encodeURIComponent(c.id)}`;
        });
      }

      return;
    }

    if (page === "docket") {
      const el = $("#cc-docket");
      const q = $("#cc-q");
      const btnClear = $("#cc-clear");
      if (!el) return;

      function renderList(filter) {
        const cases = loadCases();
        const f = (filter || "").trim().toLowerCase();
        const shown = f
          ? cases.filter(c => (c.id||"").toLowerCase().includes(f) || (c.text||"").toLowerCase().includes(f))
          : cases;

        el.innerHTML = shown.length
          ? `<ul class="list">${shown.map(c => `
              <li class="item">
                <div class="row">
                  <div class="grow">
                    <div><a href="fp-05.html?id=${encodeURIComponent(c.id)}">${escapeHtml(c.id)}</a></div>
                    <small>${escapeHtml(c.verdictText || "未判决")}</small>
                  </div>
                  <span class="pill ${escapeHtml(c.verdictLevel || "warn")}">${escapeHtml(c.verdictLevel || "—")}</span>
                  <button class="danger" data-del="${escapeHtml(c.id)}" type="button">删除</button>
                </div>
                <div class="hr"></div>
                <div class="muted" style="font-family:var(--mono)">${escapeHtml((c.text||"").slice(0,140))}${(c.text||"").length>140?"…":""}</div>
              </li>
            `).join("")}</ul>`
          : `<p class="muted">案卷库为空。</p>`;
      }

      renderList("");

      if (q) {
        q.addEventListener("input", () => renderList(q.value));
      }

      el.addEventListener("click", (e) => {
        const b = e.target;
        if (b && b.matches("button[data-del]")) {
          const cid2 = b.getAttribute("data-del");
          deleteCase(cid2);
          renderList(q ? q.value : "");
        }
      });

      if (btnClear) {
        btnClear.addEventListener("click", () => {
          if (!confirm("清空本地案卷库？（只影响当前浏览器）")) return;
          saveCases([]);
          setLastCaseId("");
          renderList(q ? q.value : "");
        });
      }

      return;
    }
  }

  document.addEventListener("DOMContentLoaded", render);
})();

