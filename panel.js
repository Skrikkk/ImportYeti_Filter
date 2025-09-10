// panel.js - 支持多关键词、保留高亮、清除高亮、按顺序移动并延迟保存原序
(function () {
  if (document.getElementById("lift-panel")) return; // 避免重复注入

  // 创建悬浮面板 UI
  const panel = document.createElement("div");
  panel.id = "lift-panel";
  panel.innerHTML = `
    <input id="keyword-input" type="text" placeholder="关键词用分号分隔，例如: lift;fork" style="width:100%;margin-bottom:6px;padding:4px;">
    <div style="display:flex;gap:6px;margin-bottom:6px;">
      <button id="highlight-btn" style="flex:1">高亮匹配</button>
      <button id="move-btn" style="flex:1">移到最前</button>
    </div>
    <div style="display:flex;gap:6px;">
      <button id="clear-btn" style="flex:1">清除高亮</button>
      <button id="restore-btn" style="flex:1">恢复原序</button>
    </div>
    <div id="panel-msg" style="margin-top:6px;font-size:11px;color:#666"></div>
  `;
  document.body.appendChild(panel);

  // 面板样式（可拖动）
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "260px",
    padding: "10px",
    background: "white",
    border: "1px solid #ccc",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
    zIndex: "2147483647",
    fontSize: "13px",
    cursor: "move",
    userSelect: "none"
  });

  // 拖动逻辑（点击 input/button 时不拖动）
  let offsetX = 0, offsetY = 0, isDown = false;
  panel.addEventListener("mousedown", e => {
    const tag = e.target.tagName;
    if (tag === "BUTTON" || tag === "INPUT" || e.target.closest('button')) return;
    isDown = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
  });
  document.addEventListener("mousemove", e => {
    if (!isDown) return;
    panel.style.left = (e.clientX - offsetX) + "px";
    panel.style.top = (e.clientY - offsetY) + "px";
    panel.style.bottom = "auto";
    panel.style.right = "auto";
  });
  document.addEventListener("mouseup", () => isDown = false);

  const msgEl = panel.querySelector("#panel-msg");
  function setMsg(t) { msgEl.textContent = t || ""; }

  // ----- 更严格的目标行识别，避免误识别 neutral 类 -----
  function isTargetRow(tr) {
    if (!tr || !tr.classList) return false;
    const cls = Array.from(tr.classList);
    if (!cls.includes('bg-yeti-bg')) return false;
    const hasBgEven = cls.some(c => c.startsWith('even:bg-yeti-bg-'));
    const hasNeutralEven = cls.some(c => c.startsWith('even:bg-yeti-neutral-'));
    return hasBgEven && !hasNeutralEven;
  }

  function getAllTargetRows() {
    return Array.from(document.querySelectorAll('tr')).filter(isTargetRow);
  }

  // 将关键词列表转换为小写的数组
  function parseKeywords(raw) {
    return raw.split(";").map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase());
  }

  // 根据关键词列表匹配行（关键词任意匹配视为命中）
  function getMatchedRowsByKeys(keys) {
    if (!keys || keys.length === 0) return [];
    const all = getAllTargetRows();
    return all.filter(tr => {
      const text = (tr.innerText || "").toLowerCase();
      return keys.some(k => k && text.includes(k));
    });
  }

  // 清除所有高亮（移除样式和自定义 class）
  function clearAllHighlights() {
    getAllTargetRows().forEach(tr => {
      tr.style.backgroundColor = "";
      tr.classList.remove("lift-panel-highlight");
    });
  }

  // 高亮：为匹配到的行打黄色背景并加 class（方便后续清除）
  panel.querySelector("#highlight-btn").addEventListener("click", () => {
    const raw = panel.querySelector("#keyword-input").value || "";
    const keys = parseKeywords(raw);
    if (keys.length === 0) { alert("请输入关键词（用分号分隔）"); return; }

    clearAllHighlights();

    const matched = getMatchedRowsByKeys(keys);
    matched.forEach(tr => {
      tr.style.backgroundColor = "yellow";
      tr.classList.add("lift-panel-highlight");
    });

    setMsg(`已高亮 ${matched.length} 行（关键词：${keys.join(", ")}）`);
  });

  // ----- 延迟保存原序：在用户第一次点击“移到最前”时保存当前顺序 -----
  function saveOriginalOrderIfNeeded() {
    if (window._liftPanelOriginalRows && window._liftPanelOriginalParent) return;
    const rows = getAllTargetRows();
    if (rows.length === 0) return;
    const parent = rows[0].parentNode;
    // 保存 parent 引用与当时的行顺序（保存 DOM 节点引用）
    window._liftPanelOriginalParent = parent;
    window._liftPanelOriginalRows = Array.from(parent.children).filter(isTargetRow);
    setMsg(`已保存 ${window._liftPanelOriginalRows.length} 行的原始顺序（首次移动时保存）`);
  }

  // 移动（按输入关键词顺序分组，组内保留原序），并**保留匹配高亮**
  panel.querySelector("#move-btn").addEventListener("click", () => {
    const raw = panel.querySelector("#keyword-input").value || "";
    const keys = parseKeywords(raw);
    if (keys.length === 0) { alert("请输入关键词（用分号分隔）"); return; }

    const allRows = getAllTargetRows();
    if (allRows.length === 0) return setMsg("未找到目标行（请先滚动加载完整表格）");

    // 首次移动前保存原序
    saveOriginalOrderIfNeeded();

    const parent = allRows[0].parentNode;
    // 以当前 parent 的 children 顺序作为 baseOrder（避免抓到不完整）
    const baseOrder = Array.from(parent.children).filter(isTargetRow);

    // 按 keys 顺序分组匹配（保证每行只被放一次，若行匹配多个关键词放到最先出现的关键词组）
    const matchedSet = new Set();
    const matchedOrdered = [];
    for (const key of keys) {
      for (const row of baseOrder) {
        if (matchedSet.has(row)) continue;
        if ((row.innerText || "").toLowerCase().includes(key)) {
          matchedSet.add(row);
          matchedOrdered.push(row);
        }
      }
    }

    if (matchedOrdered.length === 0) {
      return setMsg(`未找到匹配行（关键词：${keys.join(", ")})`);
    }

    // 将匹配行移动到 parent 最前面，**不移除高亮**（保留用户标记）
    const frag = document.createDocumentFragment();
    matchedOrdered.forEach(row => {
      frag.appendChild(row); // appendChild 会把节点从原位置移动到 frag
    });
    parent.insertBefore(frag, parent.firstChild);

    setMsg(`已将 ${matchedOrdered.length} 行按关键词顺序移动到最前（顺序：${keys.join(" > ")})`);
  });

  // 恢复原序（恢复到用户第一次点击“移到最前”时保存的顺序）
  panel.querySelector("#restore-btn").addEventListener("click", () => {
    if (!window._liftPanelOriginalRows || !window._liftPanelOriginalParent) {
      return setMsg("尚未保存原始顺序（首次点击“移到最前”时会保存）。");
    }
    const parent = window._liftPanelOriginalParent;
    const frag = document.createDocumentFragment();
    // 将保存的行按保存顺序重新 append（移动节点到最后，整体顺序恢复为保存时的相对顺序）
    window._liftPanelOriginalRows.forEach(row => {
      if (row) frag.appendChild(row);
    });
    // 插入到 parent 开头（这样所有 target-row 会按保存顺序出现在最前）
    parent.insertBefore(frag, parent.firstChild);
    // 高亮状态保持（如果想恢复时清高亮，可在这里调用 clearAllHighlights()）
    setMsg("已恢复为首次移动时保存的顺序（刷新页面会重置保存）。");
  });

  // 清除高亮（不改变行顺序）
  panel.querySelector("#clear-btn").addEventListener("click", () => {
    clearAllHighlights();
    setMsg("已清除所有高亮");
  });

  // 初始提示
  setMsg("请输入关键词");
})();
