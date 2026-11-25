const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (v, d = 0) =>
  new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v);
const pct = (v) => `${num(v * 100, 2)}%`;
const decimal = (v) => num(v, 4);
const routes = {
  overview: "Tổng quan đề tài",
  experiment: "So sánh dự đoán",
  results: "Đánh giá mô hình",
  discussion: "Nhận xét và cải tiến",
  method: "Dữ liệu và mô hình",
};
const state = {
  bootstrap: null,
  study: null,
  modelGroup: "h1",
  route: "overview",
  profile: "",
  query: "",
  preset: "all",
  protocol: "full_catalog",
  cohort: "all",
  metricOrder: "ndcg10",
  selected: [],
  case: null,
  metrics: new Map(),
  generation: 0,
  profileGeneration: 0,
  profilesLoading: false,
  caseRequest: null,
};
let searchTimer;
async function api(url, options = {}) {
  const res = await fetch(url, options);
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error("Máy chủ chưa trả dữ liệu hợp lệ. Vui lòng thử lại.");
  }
  if (!res.ok)
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : `Yêu cầu không hợp lệ (${res.status}).`,
    );
  return data;
}
async function getMetrics(protocol = "full_catalog", cohort = "all") {
  const key = `${protocol}/${cohort}`;
  if (!state.metrics.has(key)) {
    const request = api(`/api/metrics?protocol=${protocol}&cohort=${cohort}`);
    state.metrics.set(key, request);
    request.catch(() => state.metrics.delete(key));
  }
  return state.metrics.get(key);
}
function heading(title, description) {
  return `<div class="page-heading"><div><h1>${h(title)}</h1><p>${h(description)}</p></div></div>`;
}
function loading(text = "Đang đọc kết quả đã kiểm chứng…") {
  return `<div class="loading-inline" role="status"><span class="spinner"></span>${h(text)}</div>`;
}
function errorBlock(err, action = "retry") {
  return `<div class="notice notice-error" role="alert">${h(err.message)}<div><button class="btn btn-outline btn-small error-retry" data-action="${action}">Thử lại</button></div></div>`;
}
function model(id) {
  return state.bootstrap.models.find((x) => x.id === id);
}
function coreRows(rows) {
  return rows.filter((r) => state.bootstrap.default_models.includes(r.model));
}
function metricsTable(rows, full = false, highlight = "ndcg10") {
  const best = Math.max(...coreRows(rows).map((row) => row[highlight]));
  return `<div class="table-wrap" role="region" tabindex="0" aria-label="Bảng chỉ số mô hình"><table class="metrics-table"><caption class="screen-reader">Chỉ số đánh giá thực nghiệm trên cùng tập người dùng và ứng viên</caption><thead><tr><th>Mô hình</th><th>Tìm trúng / số người dùng</th><th>Tỷ lệ tìm trúng</th><th>Điểm thứ hạng</th><th>Độ phủ sản phẩm</th>${full ? "<th>Khoảng tin cậy 95%</th>" : ""}</tr></thead><tbody>${rows.map((r) => `<tr class="${r[highlight] === best ? "best" : ""}"><td>${h(model(r.model).name)}${r[highlight] === best ? '<span class="best-label">Cao nhất lần chạy</span>' : ""}<span class="metric-sub">${h(model(r.model).family)}</span></td><td class="metric-num"><strong>${num(r.hits10 ?? Math.round(r.recall10 * r.users))}</strong> / ${num(r.users)}</td><td class="metric-num">${pct(r.recall10)}</td><td class="metric-num">${decimal(r.ndcg10)}</td><td class="metric-num">${pct(r.coverage10)}</td>${full ? `<td class="metric-num">${decimal(r.ndcg_ci_low)} – ${decimal(r.ndcg_ci_high)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}
function bars(rows) {
  const max = Math.max(...rows.map((r) => r.ndcg10), 0.00001);
  return `<div class="chart" role="img" aria-label="So sánh NDCG tại 10"><div class="screen-reader">${rows.map((r) => `${model(r.model).name}: ${decimal(r.ndcg10)}`).join("; ")}</div>${rows.map((r) => `<div class="bar-row"><span>${h(model(r.model).short)}</span><div class="bar-track"><div class="bar-fill ${r.model === "content" ? "focus" : ""}" style="width:${(r.ndcg10 / max) * 100}%"></div></div><span class="bar-value">${decimal(r.ndcg10)}</span></div>`).join("")}</div>`;
}
function options(values, current) {
  return values
    .map(
      ([value, label]) =>
        `<option value="${h(value)}" ${value === current ? "selected" : ""}>${h(label)}</option>`,
    )
    .join("");
}
function protocolOptions(current) {
  return options(
    [
      ["full_catalog", "Toàn bộ danh mục · 2.934 sản phẩm"],
      ["sampled100", "100 ứng viên cố định"],
    ],
    current,
  );
}
function methodEntries(entries) {
  return entries.map(({ title, description }) =>
    `<div><h4>${h(title)}</h4><p>${h(description)}</p></div>`
  ).join("");
}
function metricLegend() {
  return `<div class="metric-legend">${methodEntries(state.study.evaluation.metrics)}</div>`;
}
function overview() {
  const b = state.bootstrap,
    a = b.audit;
  $("#main").innerHTML =
    `<section class="hero"><div><div class="eyebrow">NHÓM DAD · AMAZON ALL BEAUTY</div><h1>Thực nghiệm hệ thống<br>gợi ý sản phẩm</h1><p>Phân tích lịch sử tương tác, so sánh sản phẩm dự đoán của ba hướng nghiên cứu và tổng hợp chỉ số đánh giá.</p><div class="hero-actions"><a href="#experiment" class="btn">Chạy thực nghiệm</a><a href="#method" class="btn btn-outline">Dữ liệu và mô hình</a></div></div></section>
<div class="stats"><div class="stat"><div class="stat-label">Hồ sơ kiểm chứng</div><div class="stat-value">${num(a.users)}</div></div><div class="stat"><div class="stat-label">Sản phẩm trong danh mục</div><div class="stat-value">${num(a.catalog)}</div></div><div class="stat"><div class="stat-label">Tương tác huấn luyện</div><div class="stat-value">${num(a.train_rows)}</div></div><div class="stat"><div class="stat-label">Mục tiêu kiểm tra chưa có trong tập huấn luyện</div><div class="stat-value">${num((a.cold_test_targets / a.test_rows) * 100, 1)}%</div></div></div>
<div class="section-heading"><div><h2>Ba hướng thực nghiệm</h2><p>Ba nhóm mô hình được đánh giá trên cùng dữ liệu đầu vào.</p></div></div>
<div class="directions-grid">${state.study.directions.map((d) => `<article class="panel research-panel"><div class="panel-index">${h(d.name.split(" — ")[0].toUpperCase())}</div><h3>${h(d.name.split(" — ")[1])}</h3><dl class="direction-facts"><dt>Đầu vào</dt><dd>${h(d.id === "h1" ? "Lịch sử sản phẩm và mốc thời gian." : d.id === "h2" ? "Đồ thị tương tác và tiêu đề sản phẩm." : "Điểm dự đoán của H1, H2 và độ phổ biến.")}</dd><dt>Đầu ra</dt><dd>${h(d.id === "h3" ? "Điểm kết hợp và 10 gợi ý được xếp hạng." : "Điểm dự đoán và 10 sản phẩm được xếp hạng.")}</dd></dl><a href="#method/${h(d.id)}" class="inline-link">Xem mô hình ${h(d.id.toUpperCase())}</a></article>`).join("")}</div>
<div class="section-heading"><div><h2>Kết quả trên toàn danh mục</h2><p>Cùng tập người dùng và ứng viên; 10 kết quả đầu.</p></div><a href="#results" class="inline-link">Xem bảng đầy đủ</a></div><div id="overview-metrics" class="panel">${loading()}</div><details class="disclosure"><summary>Kết quả mô hình tích hợp</summary><div class="small muted">${h(state.study.directions.find((d) => d.id === "h3").status)} Điểm dự đoán được lưu từ lần huấn luyện trước.</div></details>`;
  const generation = state.generation;
  getMetrics()
    .then((data) => {
      if (generation === state.generation)
        $("#overview-metrics").innerHTML = metricsTable(coreRows(data.rows));
    })
    .catch((err) => {
      if (generation === state.generation)
        $("#overview-metrics").innerHTML = errorBlock(err);
    });
}
function experiment() {
  if (
    state.case &&
    (state.case.protocol !== state.protocol ||
      state.case.profile_id !== state.profile)
  )
    state.case = null;
  const b = state.bootstrap;
  $("#main").innerHTML =
    heading(
      "So sánh dự đoán",
      "Chọn hướng nghiên cứu, người dùng và so sánh kết quả.",
    ) +
    `<form id="experiment-form" class="panel experiment-controls">
      <fieldset>
        <legend>Hướng nghiên cứu</legend>
        <div class="direction-tabs" role="group" aria-label="Hướng nghiên cứu">
          ${[
            ["h1", "H1", "Tuần tự và thời gian"],
            ["h2", "H2", "Đồ thị và nội dung"],
            ["h3", "H3", "Tích hợp H1–H2"],
            ["all", "Tất cả", "Đối chiếu chung"],
          ].map(([id, title, label]) => `<button type="button" data-group="${id}" aria-pressed="${state.modelGroup === id}"><strong>${title}</strong><span>${label}</span></button>`).join("")}
        </div>
      </fieldset>
      <fieldset>
        <legend>Hồ sơ và phạm vi đánh giá</legend>
        <div class="control-grid">
          <div><label for="profile-search">Tìm mã người dùng</label><input id="profile-search" placeholder="Ví dụ KH-0020" value="${h(state.query)}" autocomplete="off"></div>
          <div><label for="profile-select">Hồ sơ kiểm tra</label><select id="profile-select" aria-describedby="profile-feedback" required disabled><option value="">Đang tải…</option></select></div>
          <div><label for="experiment-protocol">Tập ứng viên</label><select id="experiment-protocol" aria-describedby="protocol-note">${protocolOptions(state.protocol)}</select></div>
        </div>
        <div class="profile-feedback" id="profile-feedback" role="status">Đang tải danh sách…</div>
        <p class="protocol-note" id="protocol-note">${h(b.protocols[state.protocol])}</p>
      </fieldset>
      <details class="disclosure advanced-controls">
        <summary>Bộ lọc và tùy chọn mô hình</summary>
        <div class="presets" role="group" aria-label="Nhóm người dùng">${[
          ["all", "Tất cả"],
          ["warm", "Sản phẩm đã học"],
          ["cold", "Sản phẩm chưa học"],
          ["long", "Có ít nhất 10 tương tác"],
          ["empty", "Không có lịch sử trước thời điểm kiểm tra"],
        ].map(([value, label]) => `<button type="button" class="preset ${state.preset === value ? "active" : ""}" aria-pressed="${state.preset === value}" data-action="preset" data-value="${value}">${label}</button>`).join("")}</div>
        <fieldset class="model-fieldset">
          <legend>Mô hình</legend>
          <div class="model-options">${b.models.map((m) => `<label class="model-option"><input type="checkbox" name="model" value="${m.id}" ${state.selected.includes(m.id) ? "checked" : ""}>${h(m.name)}</label>`).join("")}</div>
        </fieldset>
      </details>
      <div class="experiment-submit">
        <div id="selected-models" class="selected-models" aria-live="polite"></div>
        <button type="submit" class="btn" id="run-button" disabled>So sánh dự đoán</button>
      </div>
    </form>
    <section id="case-output" aria-label="Kết quả dự đoán" aria-live="polite">${emptyCase()}</section>`;
  $(".direction-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-group]");
    if (!button) return;
    const group = state.study.groups.find((item) => item.id === button.dataset.group);
    state.modelGroup = group.id;
    state.selected = [...group.models];
    $$("input[name=model]").forEach((input) => {
      input.checked = state.selected.includes(input.value);
    });
    refreshSelectedModels();
    invalidateCase();
  });
  $("#experiment-form").addEventListener("submit", runCase);
  $("#profile-search").addEventListener("input", (e) => {
    state.query = e.target.value;
    prepareProfileSearch();
    searchTimer = setTimeout(loadProfiles, 200);
  });
  $("#profile-select").addEventListener("change", (e) => {
    state.profile = e.target.value;
    invalidateCase();
  });
  $("#experiment-protocol").addEventListener("change", (e) => {
    state.protocol = e.target.value;
    $("#protocol-note").textContent = b.protocols[state.protocol];
    invalidateCase();
  });
  $$("input[name=model]").forEach((el) =>
    el.addEventListener("change", () => {
      state.selected = $$("input[name=model]:checked").map((x) => x.value);
      state.modelGroup = "custom";
      refreshSelectedModels();
      invalidateCase();
    }),
  );
  refreshSelectedModels();
  loadProfiles();
  if (state.case) renderCase(state.case);
}
function refreshSelectedModels() {
  $$("[data-group]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.group === state.modelGroup)));
  $("#selected-models").textContent = state.selected.length
    ? `${state.selected.length} mô hình · ${state.selected.map((id) => model(id).short).join(", ")}`
    : "Chọn ít nhất một mô hình trong phần tùy chọn.";
}
function emptyCase() {
  return `<div class="empty"><h3>Kết quả dự đoán sẽ xuất hiện tại đây</h3><p>Chạy so sánh để xem 10 gợi ý của từng mô hình và sản phẩm thực tế.</p></div>`;
}
function updateRunButton() {
  const button = $("#run-button");
  if (!button) return;
  button.disabled = Boolean(state.caseRequest || state.profilesLoading || !state.profile || !state.selected.length);
  button.textContent = state.caseRequest ? "Đang so sánh…" : "So sánh dự đoán";
}
function invalidateCase() {
  state.caseRequest?.abort();
  state.caseRequest = null;
  state.case = null;
  const output = $("#case-output");
  if (output) output.innerHTML = emptyCase();
  updateRunButton();
}
function prepareProfileSearch() {
  clearTimeout(searchTimer);
  state.profileGeneration++;
  state.profilesLoading = true;
  $("#profile-select").disabled = true;
  $("#profile-feedback").textContent = "Đang tìm hồ sơ…";
  invalidateCase();
}
async function loadProfiles() {
  const generation = ++state.profileGeneration;
  state.profilesLoading = true;
  updateRunButton();
  const cohort = ["warm", "cold"].includes(state.preset) ? state.preset : "all";
  const history = ["long", "empty"].includes(state.preset)
    ? state.preset
    : "all";
  try {
    const data = await api(
      `/api/profiles?query=${encodeURIComponent(state.query)}&cohort=${cohort}&history=${history}&limit=60`,
    );
    if (generation !== state.profileGeneration || state.route !== "experiment")
      return;
    const select = $("#profile-select");
    const previousProfile = state.profile;
    if (!data.items.length) {
      select.innerHTML = '<option value="">Không tìm thấy hồ sơ</option>';
      state.profile = "";
    } else {
      if (!data.items.some((p) => p.id === state.profile))
        state.profile = data.items[0].id;
      select.innerHTML = data.items
        .map(
          (p) =>
            `<option value="${h(p.id)}" ${p.id === state.profile ? "selected" : ""}>${h(p.id)} · ${num(p.history_length)} tương tác trước kiểm tra</option>`,
        )
        .join("");
    }
    select.disabled = !data.items.length;
    if (previousProfile !== state.profile) invalidateCase();
    $("#profile-feedback").textContent =
      `Hiển thị ${num(data.items.length)} / ${num(data.total)} hồ sơ phù hợp.`;
  } catch (err) {
    if (generation === state.profileGeneration && state.route === "experiment") {
      state.profile = "";
      $("#profile-select").innerHTML = '<option value="">Chưa tải được hồ sơ</option>';
      $("#profile-select").disabled = true;
      $("#profile-feedback").innerHTML = errorBlock(err, "retry-profiles");
      invalidateCase();
    }
  } finally {
    if (generation === state.profileGeneration) {
      state.profilesLoading = false;
      updateRunButton();
    }
  }
}
async function runCase(event) {
  event.preventDefault();
  if ($("#run-button").disabled) return;

  const request = new AbortController();
  state.caseRequest = request;
  updateRunButton();
  $("#case-output").innerHTML = loading("Đang xếp hạng trên cùng tập ứng viên…");
  try {
    const data = await api("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile_id: state.profile,
        protocol: state.protocol,
        models: state.selected,
      }),
      signal: request.signal,
    });
    if (state.caseRequest !== request) return;
    state.case = data;
    renderCase(data);
    $("#case-heading").focus();
  } catch (err) {
    if (state.caseRequest === request)
      $("#case-output").innerHTML = errorBlock(err, "retry-case");
  } finally {
    if (state.caseRequest === request) {
      state.caseRequest = null;
      updateRunButton();
    }
  }
}
function comparisonSummary(data) {
  return `<section class="panel case-summary" aria-labelledby="case-summary-title">
    <h3 id="case-summary-title">Sản phẩm thực tế xếp hạng bao nhiêu?</h3>
    <div class="table-wrap" tabindex="0" role="region" aria-labelledby="case-summary-title">
      <table class="metrics-table">
        <thead><tr><th scope="col">Mô hình</th><th scope="col">Thứ hạng</th><th scope="col">Trong top 10</th><th scope="col">NDCG@10</th></tr></thead>
        <tbody>${data.results.map((result) => {
          const outsideOutput = !result.target_in_learned_output && !result.uses_fallback;
          const note = outsideOutput ? '<small>Ngoài bộ sản phẩm đã học</small>'
            : result.uses_fallback ? '<small>Dự phòng theo độ phổ biến</small>' : "";
          return `<tr>
            <th scope="row"><a class="ranking-link" href="#ranking-${h(result.model)}" data-action="jump-ranking"><span>${h(result.name)}</span><span aria-hidden="true">→</span></a>${note}</th>
            <td class="metric-num">${num(result.rank)}</td>
            <td>${result.hit10 ? "Có" : "Không"}</td>
            <td class="metric-num">${decimal(result.ndcg10)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
    ${data.results.some((result) => !result.target_in_learned_output && !result.uses_fallback)
      ? '<p class="table-caption">Với sản phẩm ngoài bộ đã học, thứ hạng vẫn được ghi theo giao thức đánh giá. Các sản phẩm bằng điểm được xếp theo mã sản phẩm.</p>' : ""}
  </section>`;
}
function renderCase(data) {
  const itemRow = (item) => `<li class="ranking-item ${item.is_target ? "target" : ""}"><span class="ranking-pos">${String(item.rank).padStart(2, "0")}</span><div><span class="ranking-title" title="${h(item.title)}">${h(item.title)}</span><small>${h(item.item_id)}${item.is_target ? " · SẢN PHẨM THỰC TẾ" : ""}</small></div></li>`;
  $("#case-output").innerHTML = `<div class="section-heading"><div><h2 id="case-heading" tabindex="-1">Kết quả · ${h(data.profile_id)}</h2><p>${num(data.candidate_count)} sản phẩm · ${data.results.length} mô hình</p></div><button class="btn btn-outline btn-small" data-action="case-csv">Tải kết quả CSV ↓</button></div>
    <div class="panel compact-target"><div><span class="target-label">SẢN PHẨM THỰC TẾ</span><h3>${h(data.target.title)}</h3><code>${h(data.target.item_id)}</code></div><span class="tag">${data.target.warm ? "Đã có trong tập huấn luyện" : "Chưa có trong tập huấn luyện"}</span></div>
    ${data.fallback ? '<div class="notice notice-warning">Không có tương tác trước thời điểm kiểm tra. Các mô hình dùng chung dự phòng theo độ phổ biến.</div>' : ""}
    ${comparisonSummary(data)}
    <h3 class="ranking-heading">Danh sách gợi ý theo mô hình</h3>
    <div class="comparison-grid compact-comparison">${data.results.map((result) => {
      const unsupported = result.target_in_learned_output === false && !result.uses_fallback;
      const badge = result.uses_fallback ? "Dự phòng theo độ phổ biến" : unsupported ? "Ngoài bộ sản phẩm đã học" : result.hit10 ? "Tìm trúng trong 10 kết quả" : "Chưa tìm trúng";
      return `<article class="model-card" id="ranking-${h(result.model)}" tabindex="-1"><header class="model-card-head"><div><span class="model-family">${h(model(result.model).family)}</span><h3>${h(result.name)}</h3></div></header><div class="compact-score"><span class="hit-badge ${result.hit10 ? "" : "miss-badge"}">${badge}</span><p>${unsupported ? "Không có đầu ra đã học" : `Hạng ${num(result.rank)} / ${num(data.candidate_count)}`}<span>NDCG ${decimal(result.ndcg10)}</span></p></div><ol class="ranking-list">${result.top10.slice(0, 5).map(itemRow).join("")}</ol><details class="ranking-more"><summary>Xem hạng 6–10</summary><ol class="ranking-list">${result.top10.slice(5).map(itemRow).join("")}</ol></details></article>`;
    }).join("")}</div>
    <details class="disclosure"><summary>Lịch sử và thông tin thực nghiệm · ${data.history.length} tương tác</summary><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Sản phẩm</th><th>Mốc tương tác</th></tr></thead><tbody>${data.history.map((item) => `<tr><td class="wrap-cell">${h(item.title)}</td><td>${num(item.timestamp)}</td></tr>`).join("") || '<tr><td colspan="2">Hồ sơ này chưa có tương tác trước thời điểm kiểm tra.</td></tr>'}</tbody></table></div><p>Chỉ dùng lịch sử trước mốc ${num(data.cutoff)}; đơn vị thời gian chưa được xác minh. Sản phẩm thực tế thuộc tập kiểm tra.</p><p>Đối chiếu điểm dự đoán đã lưu, không huấn luyện lại. Mã ${h(data.run_id)} · Xếp hạng máy chủ ${num(data.server_ms, 2)} ms.</p></details><a href="#results" class="btn btn-outline">Xem đánh giá toàn tập →</a>`;
}
async function results() {
  const generation = state.generation;
  $("#main").innerHTML =
    heading(
      "Kết quả thực nghiệm",
      "Mỗi người dùng có một sản phẩm thực tế để đối chiếu. Dự đoán tìm trúng khi sản phẩm đó nằm trong 10 gợi ý đầu.",
    ) +
    `<div class="result-controls"><div><label for="metrics-protocol">Phạm vi đánh giá</label><select id="metrics-protocol">${protocolOptions(state.protocol)}</select></div><div><label for="metrics-cohort">Nhóm sản phẩm thực tế</label><select id="metrics-cohort">${options(
      [
        ["all", "Tất cả người dùng"],
        ["warm", "Đã có trong tập huấn luyện"],
        ["cold", "Chưa có trong tập huấn luyện"],
      ],
      state.cohort,
    )}</select></div><a href="/api/export/metrics.csv" class="btn btn-outline">Xuất toàn bộ CSV ↓</a><a id="report-link" href="/api/export/report.md?protocol=${state.protocol}&cohort=${state.cohort}" class="btn">Tải nhận xét & kết quả ↓</a></div><div class="study-strip" id="metric-context"></div><div id="metrics-body">${loading()}</div>`;
  const update = async () => {
    const protocol = $("#metrics-protocol").value,
      cohort = $("#metrics-cohort").value;
    state.protocol = protocol;
    state.cohort = cohort;
    $("#metrics-body").innerHTML = loading();
    $("#metric-context").textContent = "";
    $("#report-link").href = `/api/export/report.md?protocol=${protocol}&cohort=${cohort}`;
    try {
      const data = await getMetrics(protocol, cohort);
      if (
        generation !== state.generation ||
        state.protocol !== protocol ||
        state.cohort !== cohort
      )
        return;
      $("#metric-context").innerHTML =
        `<strong>${num(data.rows[0]?.users || 0)} hồ sơ</strong><span>${h(state.bootstrap.protocols[protocol])}</span>`;
      const rows = coreRows(data.rows);
      $("#metrics-body").innerHTML =
        `<div class="panel"><div class="metrics-panel-head"><h2>Chỉ số theo mô hình</h2><div><label for="metrics-order">Sắp xếp theo</label><select id="metrics-order">${options([
          ["ndcg10", "Điểm thứ hạng"],
          ["recall10", "Tỷ lệ tìm trúng"],
          ["coverage10", "Độ phủ sản phẩm"],
        ], state.metricOrder)}</select></div></div><div id="ordered-metrics"></div><p class="table-caption">Tìm trúng / số người dùng: số trường hợp dự đoán đúng trong 10 kết quả đầu trên tổng số người được đánh giá.</p></div><details class="disclosure"><summary>Ý nghĩa các chỉ số</summary>${metricLegend()}</details><details class="disclosure"><summary>Khoảng tin cậy của điểm thứ hạng</summary><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Mô hình</th><th>NDCG@10</th><th>Khoảng tin cậy 95%</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${h(model(r.model).name)}</td><td>${decimal(r.ndcg10)}</td><td>${decimal(r.ndcg_ci_low)} – ${decimal(r.ndcg_ci_high)}</td></tr>`).join("")}</tbody></table></div><p class="table-caption">${h(state.study.evaluation.bootstrap)}</p></details><div class="section-heading"><div><h2>So sánh NDCG@10</h2><p>Chất lượng thứ hạng của sản phẩm thực tế trong 10 kết quả đầu.</p></div></div><div class="panel">${bars(rows)}</div><div class="notice notice-warning"><strong>Cấu hình hiện tại.</strong> H2 sử dụng LightGCN và TF-IDF/SVD, chưa triển khai MiniLM. H3 có kết quả trùng mô hình đối chứng theo nội dung.</div><details class="disclosure"><summary>Cấu hình phụ và chênh lệch chỉ số</summary><div>${metricsTable(
          data.rows.filter(
            (r) => !state.bootstrap.default_models.includes(r.model),
          ),
          true,
        )}${data.contrasts.length ? `<h4 style="margin-top:20px">Chênh lệch NDCG so với mô hình đối chứng theo nội dung</h4><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Mô hình</th><th>Δ NDCG</th><th>Khoảng tin cậy 95% theo cặp</th></tr></thead><tbody>${data.contrasts.map((r) => `<tr><td>${h(model(r.model).name)}</td><td class="metric-num">${decimal(r.ndcg_delta)}</td><td class="metric-num">${decimal(r.ci_low)} – ${decimal(r.ci_high)}</td></tr>`).join("")}</tbody></table></div><p class="table-caption">Chênh lệch được tính trên cùng người dùng; chưa hiệu chỉnh nhiều phép so sánh.</p>` : ""}</div></details>`;
      const order = $("#metrics-order");
      const renderTable = () => {
        state.metricOrder = order.value;
        const sorted = [...rows].sort((a, b) => b[state.metricOrder] - a[state.metricOrder]);
        $("#ordered-metrics").innerHTML = metricsTable(sorted, false, state.metricOrder);
      };
      order.addEventListener("change", renderTable);
      renderTable();
    } catch (err) {
      if (generation === state.generation && state.protocol === protocol && state.cohort === cohort)
        $("#metrics-body").innerHTML = errorBlock(err);
    }
  };
  $("#metrics-protocol").addEventListener("change", update);
  $("#metrics-cohort").addEventListener("change", update);
  await update();
}
const discussionData = [
  {
    family: "Hướng 1 · M1",
    title: "GRU4Rec — chuỗi tương tác",
    strength:
      "Học thứ tự sản phẩm trong lịch sử và tạo điểm dự đoán cho tương tác tiếp theo.",
    limit:
      "Chỉ có đầu ra cho sản phẩm đã học. Lịch sử ngắn và sản phẩm mới làm giảm khả năng dự đoán.",
    next: "Bổ sung chuỗi tương tác sạch; đánh giá riêng theo độ dài lịch sử và mức độ xuất hiện của sản phẩm.",
  },
  {
    family: "Hướng 1 · M2",
    title: "Khoảng cách thời gian",
    strength: "Bổ sung khoảng cách giữa hai tương tác vào đầu vào của GRU.",
    limit:
      "Mốc thời gian chưa rõ đơn vị và có nhiều giá trị trùng; chưa diễn giải được khoảng cách theo ngày.",
    next: "Khôi phục thời gian gốc và so sánh với M1 trong cùng điều kiện huấn luyện.",
  },
  {
    family: "Hướng 1 · M3",
    title: "Suy giảm theo thời gian",
    strength:
      "Giảm trọng số véc-tơ đầu vào của các tương tác cũ để ưu tiên lịch sử gần.",
    limit:
      "Chưa áp dụng suy giảm lên trạng thái GRU. Tham số suy giảm chưa được tối ưu đầy đủ; tương tác cũ hữu ích có thể bị giảm trọng số.",
    next: "Chọn tham số suy giảm bằng tập xác thực; phân tích riêng hành vi mua lặp và thay đổi sở thích.",
  },
  {
    family: "Hướng 2",
    title: "Đồ thị và nội dung",
    strength:
      "Kết hợp quan hệ người dùng–sản phẩm với thông tin tiêu đề để tạo điểm gợi ý.",
    limit:
      "Đồ thị tương tác thưa; thông tin văn bản chỉ có tiêu đề. Đang dùng TF-IDF/SVD, chưa triển khai MiniLM. Ngày xuất bản sản phẩm chưa được xác minh.",
    next: "Bổ sung mô tả sản phẩm; so sánh TF-IDF với MiniLM và đánh giá riêng đóng góp của đồ thị.",
  },
  {
    family: "Hướng 3",
    title: "Mô hình tích hợp H1–H2",
    strength:
      "Phối hợp nhiều nguồn điểm theo cùng mã người dùng và sản phẩm; trọng số được chọn bằng tập xác thực.",
    limit:
      "Cấu hình hiện tại có trọng số H1 = 0, H2 = 1 và độ phổ biến = 0. Kết quả trùng mô hình đối chứng theo nội dung.",
    next: "Cải thiện các mô hình thành phần; đánh giá cách phối hợp theo độ dài lịch sử và mức độ xuất hiện của sản phẩm.",
  },
];
async function discussion() {
  const generation = state.generation;
  $("#main").innerHTML =
    heading(
      "Nhận xét và hướng cải tiến",
      "Ưu điểm, hạn chế và đề xuất cải tiến của ba hướng nghiên cứu.",
    ) +
    `<div id="discussion-evidence">${loading()}</div><div class="two-col">${discussionData.map((x) => `<article class="discussion-card"><span class="model-family">${h(x.family)}</span><h3>${h(x.title)}</h3><div class="discussion-block"><strong>Điểm mạnh về thiết kế</strong><p>${h(x.strength)}</p></div><div class="discussion-block"><strong>Hạn chế</strong><p>${h(x.limit)}</p></div><div class="discussion-block"><strong>Hướng cải tiến</strong><p>${h(x.next)}</p></div></article>`).join("")}</div><div class="section-heading"><div><h2>Nội dung phát triển tiếp theo</h2><p></p></div><span class="section-tag">ĐỊNH HƯỚNG NGHIÊN CỨU</span></div><div class="priority-list">${[
      [
        "01",
        "Chuẩn hóa dữ liệu và phương pháp đánh giá",
        "Khôi phục thời gian gốc, ngày xuất bản và thông tin sản phẩm; phân chia tập huấn luyện, xác thực và kiểm tra theo thời gian toàn hệ thống.",
      ],
      [
        "02",
        "Hoàn thiện các mô hình thành phần",
        "Đánh giá M1/M2/M3, bổ sung MiniLM cho H2 và kiểm tra các phương án phối hợp của H3 trên cùng dữ liệu.",
      ],
      [
        "03",
        "Đánh giá từng thành phần và nhiều lần khởi tạo",
        "Đánh giá toàn danh mục, tách sản phẩm đã học và chưa học; phân tích chuỗi ngắn, chuỗi dài và nhiều lần khởi tạo. Chọn cấu hình bằng tập xác thực.",
      ],
      [
        "04",
        "Đánh giá khả năng ứng dụng",
        "So sánh H3 với các mô hình thành phần và mô hình đối chứng. Khả năng ứng dụng được đánh giá riêng bằng dữ liệu thực tế.",
      ],
    ]
      .map(
        ([n, t, p]) =>
          `<div class="priority-row"><div class="priority-number">${n}</div><div><h4>${h(t)}</h4><p>${h(p)}</p></div></div>`,
      )
      .join("")}</div>`;
  try {
    const [all, warm, cold] = await Promise.all([
      getMetrics(),
      getMetrics("full_catalog", "warm"),
      getMetrics("full_catalog", "cold"),
    ]);
    if (generation !== state.generation) return;
    const text = all.rows.find((r) => r.model === "content");
    const bestH1 = warm.rows
      .filter((r) => ["m1", "m2", "m3"].includes(r.model))
      .sort((a, b) => b.ndcg10 - a.ndcg10)[0];
    const coldText = cold.rows.find((r) => r.model === "content");
    $("#discussion-evidence").innerHTML =
      `<div class="study-strip"><strong>Kết quả thực nghiệm ${h(state.bootstrap.run_id)}</strong><span>Đánh giá toàn bộ ${num(state.bootstrap.audit.catalog)} sản phẩm · Đánh giá trên tập tương tác đã lưu.</span></div><div class="stats"><div class="stat"><div class="stat-label">Nội dung · Tỷ lệ tìm trúng</div><div class="stat-value">${pct(text.recall10)}</div><small>NDCG ${decimal(text.ndcg10)}</small></div><div class="stat"><div class="stat-label">${h(model(bestH1.model).short)} · Tỷ lệ tìm trúng sản phẩm đã học</div><div class="stat-value">${pct(bestH1.recall10)}</div><small>${bestH1.users} sản phẩm đã có trong tập huấn luyện</small></div><div class="stat"><div class="stat-label">Nội dung · Tỷ lệ tìm trúng sản phẩm chưa học</div><div class="stat-value">${pct(coldText.recall10)}</div><small>${coldText.users} sản phẩm chưa có trong tập huấn luyện</small></div><div class="stat"><div class="stat-label">Trọng số đồ thị của H2 kết hợp</div><div class="stat-value">${num(state.bootstrap.audit.h2_graph_weight, 2)}</div><small>Tập xác thực chọn trọng số đồ thị bằng 0</small></div></div>`;
  } catch (err) {
    if (generation === state.generation)
      $("#discussion-evidence").innerHTML = errorBlock(err);
  }
}
async function methodology() {
  const b = state.bootstrap,
    a = b.audit,
    study = state.study,
    data = study.data,
    generation = state.generation;
  $("#main").innerHTML =
    heading(
      "Dữ liệu và mô hình nghiên cứu",
      "Đầu vào, cách xử lý, đầu ra và kết quả hiện có của ba hướng.",
    ) +
    `
  <section class="panel research-method"><h2>Quy trình thực nghiệm và vận hành</h2>
    <div class="method-grid">${methodEntries(study.evaluation.workflow)}</div>
    <details class="disclosure"><summary>Hai cách chọn tập ứng viên</summary><div class="method-grid">${methodEntries(study.evaluation.protocols)}</div></details>
    <details class="disclosure"><summary>Cách tính ba chỉ số tại Top 10</summary>${metricLegend()}<p class="table-caption">${h(study.evaluation.bootstrap)}</p></details>
  </section>
  <div class="section-heading"><div><h2>Dữ liệu thực nghiệm</h2><p>${h(data.source)}. ${h(data.interaction_note)}</p></div></div>
  <div class="panel"><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Tập dữ liệu</th><th>Tương tác</th><th>Người dùng</th><th>Sản phẩm</th><th>Vai trò</th></tr></thead><tbody>${data.splits
    .filter((x) => x.id !== "raw_train")
    .map(
      (x) =>
        `<tr><td>${h(x.name)}</td><td>${num(x.interactions)}</td><td>${num(x.users)}</td><td>${num(x.items)}</td><td class="wrap-cell">${h(x.purpose)}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div><p class="table-caption">Tập huấn luyện gốc có ${num(a.raw_train_rows)} tương tác; ${a.excluded_ambiguous_train_rows} dòng đã được loại do mốc thời gian không phù hợp. Danh mục chung có ${num(data.catalog_items)} sản phẩm.</p></div>
  <div class="data-breakdown"><div class="panel"><h3>Sản phẩm thực tế trong tập kiểm tra</h3><dl class="study-counts"><dt>Đã có tương tác huấn luyện</dt><dd>${num(data.warm_targets)} / ${a.users}</dd><dt>Chưa có tương tác huấn luyện</dt><dd>${num(data.cold_targets)} / ${a.users}</dd></dl></div><div class="panel"><h3>Lịch sử trước thời điểm kiểm tra</h3><dl class="study-counts">${data.history_groups.map((x) => `<dt>${h(x.label)}</dt><dd>${num(x.users)} người</dd>`).join("")}</dl></div></div>
  <div class="section-heading"><div><h2>Cấu trúc từng hướng nghiên cứu</h2><p>${h(study.execution.description)}</p></div></div>
  <div class="model-definitions">${study.directions
    .map(
      (d) =>
        `<article class="panel model-definition" id="direction-${d.id}"><div class="model-definition-head"><h3>${h(d.name)}</h3><span>${d.models.map((id) => h(model(id).name)).join(" · ")}</span></div><dl class="definition-grid"><dt>Đầu vào</dt><dd>${h(d.input)}</dd><dt>Cách xử lý</dt><dd>${h(d.processing)}</dd><dt>Đầu ra</dt><dd>${h(d.output)}</dd><dt>Phạm vi áp dụng</dt><dd>${h(d.scope)}</dd><dt>Trạng thái thực nghiệm</dt><dd>${h(d.status)}</dd></dl>${d.formula ? `<div class="weight-formula">${h(d.formula)}${d.collapses_to_content ? "<p>Nhánh H2 kết hợp có trọng số đồ thị bằng 0, nên điểm H3 hiện trùng điểm nội dung.</p>" : ""}</div>` : ""}<details class="disclosure"><summary>Thông số mô hình</summary><table class="metrics-table"><tbody>${Object.entries(
          d.parameters,
        )
          .map(([k, v]) => `<tr><td>${h(k)}</td><td>${h(v)}</td></tr>`)
          .join("")}</tbody></table></details></article>`,
    )
    .join("")}</div>
  <div class="section-heading"><div><h2>Diễn biến huấn luyện trên tập xác thực</h2><p>Các đường cong được lấy từ nhật ký huấn luyện đã lưu.</p></div></div><div id="training-charts">${loading()}</div><details class="disclosure"><summary>Điều kiện đánh giá</summary><div><p class="small">${h(data.time_status)}</p><p class="small">${h(data.metadata_status)}</p><p class="small">${h(b.protocols.full_catalog)} ${h(b.protocols.sampled100)}</p><p class="small">Cấu hình được chọn trên tập xác thực. Kết quả kiểm tra không được dùng để học lại trọng số.</p></div></details><div class="download-row" style="margin-top:18px"><a class="btn" href="/api/export/report.md">Tải báo cáo thực nghiệm</a><a class="btn btn-outline" href="/api/export/metrics.csv">Tải bảng kết quả</a></div>`;
  $$(".model-definition").forEach((card) => {
    const head = $(".model-definition-head", card);
    const details = document.createElement("details");
    details.className = "compact-definition";
    const summary = document.createElement("summary");
    summary.innerHTML = head.innerHTML;
    head.remove();
    details.append(summary);
    while (card.firstChild) details.append(card.firstChild);
    card.append(details);
  });
  try {
    const data = await api("/api/training");
    if (generation !== state.generation) return;
    const names = [...new Set(data.rows.map((r) => r.model))];
    const max = Math.max(...data.rows.map((r) => r.val_ndcg), 0.001);
    $("#training-charts").innerHTML = `<div class="training-grid">${names
      .map((name) => {
        const rows = data.rows.filter((r) => r.model === name),
          best = Math.max(...rows.map((r) => r.val_ndcg));
        const points = rows
          .map(
            (r, i) =>
              `${8 + (i / Math.max(rows.length - 1, 1)) * 204},${95 - (r.val_ndcg / max) * 80}`,
          )
          .join(" ");
        return `<div class="training-panel"><h4>${h({ "H1 base": "M1 · GRU cơ sở", "H1 gap": "M2 · Khoảng cách thời gian", "H1 decay": "M3 · Suy giảm theo thời gian", "H2 LightGCN-Text": "H2 · Đồ thị và nội dung" }[name] || name)}</h4><svg class="sparkline" viewBox="0 0 220 110" role="img" aria-label="NDCG trên tập xác thực của ${h(name)}"><path d="M8 15H212M8 55H212M8 95H212" stroke="#e7ede1" stroke-dasharray="3 3" fill="none"/><polyline points="${points}" fill="none" stroke="#6b9670" stroke-width="2"/></svg><small>Vòng huấn luyện 1–${rows.at(-1).epoch} · NDCG cao nhất ${decimal(best)}</small></div>`;
      })
      .join(
        "",
      )}</div><p class="table-caption">Các đồ thị dùng chung thang NDCG từ 0 đến ${decimal(max)}. Chỉ số trong đồ thị thuộc tập xác thực, không phải tập kiểm tra.</p>`;
  } catch (err) {
    if (generation === state.generation)
      $("#training-charts").innerHTML = errorBlock(err);
  }
}
function downloadCase() {
  const data = state.case;
  if (!data) return;
  const cell = (v) => {
    let x = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(x)) x = "'" + x;
    return `"${x.replace(/"/g, '""')}"`;
  };
  const rows = [
    [
      "Mã thực nghiệm",
      "Mã người dùng",
      "Phạm vi đánh giá",
      "Mô hình",
      "Thứ hạng",
      "Mã sản phẩm",
      "Tên sản phẩm",
      "Trùng sản phẩm thực tế",
    ],
  ];
  for (const result of data.results)
    for (const item of result.top10)
      rows.push([
        data.run_id,
        data.profile_id,
        data.protocol,
        result.name,
        item.rank,
        item.item_id,
        item.title,
        item.is_target,
      ]);
  const blob = new Blob(
    ["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `${data.profile_id}_${data.protocol}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function setMenu(expanded) {
  $("#sidebar").classList.toggle("open", expanded);
  $("#menu-button").setAttribute("aria-expanded", String(expanded));
  $("#menu-button").setAttribute("aria-label", expanded ? "Đóng điều hướng" : "Mở điều hướng");
  $("#nav-backdrop").hidden = !expanded;
}
function render() {
  if (!state.bootstrap) return;
  state.generation++;
  state.profileGeneration++;
  clearTimeout(searchTimer);
  state.caseRequest?.abort();
  state.caseRequest = null;
  const menuWasOpen = $("#sidebar").classList.contains("open");
  const [route, direction] = (location.hash.slice(1) || "experiment").split("/");
  state.route = Object.hasOwn(routes, route) ? route : "overview";
  $("#view-title").textContent = routes[state.route];
  $$("[data-nav]").forEach((el) => {
    if (el.dataset.nav === state.route) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  setMenu(false);
  window.scrollTo(0, 0);
  ({ overview, experiment, results, discussion, method: methodology })[
    state.route
  ]();
  if (state.route === "method" && ["h1", "h2", "h3"].includes(direction)) {
    const card = document.getElementById(`direction-${direction}`);
    const details = $("details.compact-definition", card);
    details.open = true;
    $("summary", details).focus({ preventScroll: true });
    card.scrollIntoView();
  } else if (menuWasOpen) {
    $("#main").focus({ preventScroll: true });
  }
}
$("#menu-button").addEventListener("click", () => {
  const expanded = !$("#sidebar").classList.contains("open");
  setMenu(expanded);
  if (expanded) ($("[data-nav][aria-current]") || $("[data-nav]")).focus();
});
$("#sidebar").addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (link?.hash === location.hash && $("#sidebar").classList.contains("open")) {
    setMenu(false);
    $("#main").focus({ preventScroll: true });
  }
});
$(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  $("#main").focus();
});
$("#nav-backdrop").addEventListener("click", () => {
  setMenu(false);
  $("#menu-button").focus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#sidebar").classList.contains("open")) {
    setMenu(false);
    $("#menu-button").focus();
  }
});
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "jump-ranking":
      e.preventDefault();
      document.getElementById(button.hash.slice(1)).focus();
      break;
    case "case-csv":
      downloadCase();
      break;
    case "retry":
      render();
      break;
    case "retry-case":
      $("#experiment-form").requestSubmit();
      break;
    case "retry-profiles":
      prepareProfileSearch();
      loadProfiles();
      break;
    case "preset":
      state.preset = button.dataset.value;
      state.query = "";
      $("#profile-search").value = "";
      $$(".preset").forEach((item) => {
        const active = item.dataset.value === state.preset;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      prepareProfileSearch();
      loadProfiles();
      break;
  }
});
window.addEventListener("hashchange", render);
async function init() {
  try {
    [state.bootstrap, state.study] = await Promise.all([
      api("/api/bootstrap"),
      api("/api/study"),
    ]);
    state.selected = [...state.study.groups.find((g) => g.id === "h1").models];
    $("#run-id").textContent = state.bootstrap.run_id;
    render();
  } catch (err) {
    $("#main").innerHTML = errorBlock(err);
    $("[data-action=retry]", $("#main")).onclick = init;
  }
}
init();
