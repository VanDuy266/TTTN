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
  store: "Cửa hàng mô phỏng",
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
const metricViews = {
  ndcg10: { label: "NDCG@10", title: "Điểm thứ hạng", format: decimal },
  recall10: { label: "Recall@10", title: "Tỷ lệ tìm trúng", format: pct },
  coverage10: { label: "Coverage@10", title: "Độ phủ sản phẩm", format: pct },
};
function bars(rows, metric = "ndcg10") {
  const { label, format } = metricViews[metric];
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const max = Math.max(sorted[0]?.[metric] ?? 0, 0.00001);
  return `<ul class="research-chart" aria-label="So sánh ${label} theo mô hình">${sorted.map((row) => `
    <li class="research-bar">
      <span>${h(model(row.model).short)}${row.model === "content" ? ' <small class="research-reference">Mốc</small>' : ""}</span>
      <span class="research-bar-track" aria-hidden="true"><span class="${row.model === "content" ? "reference" : ""}" style="width:${row[metric] / max * 100}%"></span></span>
      <strong>${format(row[metric])}</strong>
    </li>`).join("")}</ul>`;
}
function scoreTiles(items) {
  return `<dl class="research-score-tiles">${items.map(([label, value, detail]) => `
    <div><dt>${h(label)}</dt><dd>${h(value)}</dd>${detail ? `<dd class="score-detail">${h(detail)}</dd>` : ""}</div>
  `).join("")}</dl>`;
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
  $("#main").innerHTML = `
    <section class="hero research-overview-hero">
      <div class="research-intro">
        <div class="eyebrow">NHÓM DAD · AMAZON ALL BEAUTY</div>
        <h1><span>Hệ thống</span> <span>gợi ý sản phẩm</span></h1>
        <p>Khám phá ba hướng nghiên cứu, so sánh dự đoán trên cùng dữ liệu và chạy thử quy trình mua hàng.</p>
        <div class="hero-actions">
          <a href="#experiment" class="btn">Chạy thực nghiệm</a>
          <a href="#store" class="btn btn-outline">Cửa hàng mô phỏng</a>
        </div>
      </div>
      <div class="research-hero-data">
        <h2>Kết quả trên toàn danh mục</h2>
        <p>Tỷ lệ tìm trúng Top 10 · ${num(a.users)} hồ sơ</p>
        <div id="overview-chart">${loading()}</div>
        <a href="#results" class="inline-link">Mở bảng đánh giá →</a>
      </div>
    </section>
    ${scoreTiles([
      ["Hồ sơ kiểm tra", num(a.users)],
      ["Sản phẩm trong danh mục", num(a.catalog)],
      ["Tương tác huấn luyện", num(a.train_rows)],
      ["Mục tiêu chưa có trong tập huấn luyện", pct(a.cold_test_targets / a.test_rows)],
    ])}
    <div class="section-heading"><div><h2>Ba hướng thực nghiệm</h2><p>Dùng cùng dữ liệu để đối chiếu các mô hình.</p></div></div>
    <div class="directions-grid">${state.study.directions.map((d) => `
      <article class="panel research-panel research-direction">
        <span class="research-direction-code">${h(d.id.toUpperCase())}</span>
        <h3>${h(d.name.split(" — ")[1])}</h3>
        <p>${h(d.input)}</p>
        <a href="#method/${h(d.id)}" class="inline-link">Xem phương pháp →</a>
      </article>`).join("")}</div>
    <details class="disclosure"><summary>Bảng kết quả chi tiết trên toàn danh mục</summary><div id="overview-metrics">${loading()}</div></details>`;
  const generation = state.generation;
  getMetrics()
    .then(({ rows }) => {
      if (generation !== state.generation) return;
      const chartRows = ["content", "m1", "h2", "h3"].map((id) => rows.find((row) => row.model === id));
      $("#overview-chart").innerHTML = bars(chartRows, "recall10");
      $("#overview-metrics").innerHTML = metricsTable(coreRows(rows));
    })
    .catch((err) => {
      if (generation === state.generation) {
        $("#overview-chart").innerHTML = errorBlock(err);
        $("#overview-metrics").textContent = err.message;
      }
    });
}
async function compareDirections(container, protocol) {
  container.innerHTML = loading("Đang đối chiếu toàn bộ hồ sơ…");
  const request = Symbol();
  container.comparisonRequest = request;
  try {
    const data = await api(`/api/direction-comparison?protocol=${protocol}`);
    if (!container.isConnected || container.comparisonRequest !== request) return;
    const best = Math.max(...data.directions.map((direction) => direction.hits));
    const leaders = data.directions.filter((direction) => direction.hits === best);
    const leaderNames = leaders.map(({ id }) => id.toUpperCase()).join(", ");
    container.innerHTML = `
      <p class="benchmark-result"><strong>${best === 0 ? "Chưa có hướng nào tìm trúng."
        : `${leaderNames} ${leaders.length > 1 ? "đồng hạng dẫn đầu" : "dẫn đầu"}: ${num(best)}/${num(data.users)} hồ sơ trúng Top ${data.top_k}.`}</strong>
        Mỗi hồ sơ được xếp hạng trên ${num(data.candidate_count)} sản phẩm.
      </p>
      ${scoreTiles(data.directions.map(({ id, name, hits, recall, ndcg }) => [
        `${id.toUpperCase()} · ${name}`,
        `${num(hits)} / ${num(data.users)}`,
        `${pct(recall)} trúng Top ${data.top_k} · NDCG ${decimal(ndcg)}`,
      ]))}
      <p class="table-caption">So sánh ba mô hình đại diện theo số hồ sơ trúng Top 10. Biến thể H1 được chọn trên tập xác thực.${state.study.directions.find((direction) => direction.id === "h3").collapses_to_content ? " H3 có cùng điểm với mốc TF-IDF/SVD ở lần chạy này." : ""}</p>
      <div class="direction-profile-controls">
        <div><label for="direction-profile-search">Tìm mã hồ sơ</label><input type="search" id="direction-profile-search" placeholder="Ví dụ KH-0020"></div>
        <div><label for="direction-hit-filter">Lọc theo kết quả Top 10</label><select id="direction-hit-filter">
          <option value="all">Tất cả ${num(data.users)} hồ sơ</option>
          <option value="any">Có ít nhất một hướng trúng</option>
          ${data.directions.map(({ id, hits }) => `<option value="${id}">${id.toUpperCase()} tìm trúng (${num(hits)})</option>`).join("")}
          <option value="none">Cả ba hướng đều trượt</option>
        </select></div>
      </div>
      <div id="direction-profile-table"></div>`;

    let page = 0;
    const size = 20;
    const search = $("#direction-profile-search", container);
    const filter = $("#direction-hit-filter", container);
    const table = $("#direction-profile-table", container);
    const ids = data.directions.map(({ id }) => id);
    const matches = (profile) => {
      if (!profile.id.toLowerCase().includes(search.value.trim().toLowerCase())) return false;
      const mode = filter.value;
      if (mode === "all") return true;
      const hits = ids.some((id) => profile.ranks[id] <= data.top_k);
      if (mode === "any") return hits;
      if (mode === "none") return !hits;
      return profile.ranks[mode] <= data.top_k;
    };
    const renderPage = () => {
      const rows = data.profiles.filter(matches);
      const offset = page * size;
      const visible = rows.slice(offset, offset + size);
      table.innerHTML = `
        <p class="profile-feedback" role="status">${rows.length ? `${num(offset + 1)}–${num(offset + visible.length)} / ${num(rows.length)} hồ sơ phù hợp` : "Không có hồ sơ phù hợp."}</p>
        ${visible.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Kết quả Top 10 theo hồ sơ">
          <table class="metrics-table direction-profile-table">
            <thead><tr><th scope="col">Hồ sơ</th>${ids.map((id) => `<th scope="col">${id.toUpperCase()}</th>`).join("")}</tr></thead>
            <tbody>${visible.map((profile) => `<tr><th scope="row"><button type="button" class="ranking-link" data-direction-profile="${h(profile.id)}">${h(profile.id)} <span aria-hidden="true">→</span></button></th>
              ${ids.map((id) => {
                const rank = profile.ranks[id];
                const hit = rank <= data.top_k;
                return `<td><span class="direction-hit ${hit ? "is-hit" : ""}">${hit ? "Trúng" : "Trượt"}</span><small>Hạng ${num(rank)}</small></td>`;
              }).join("")}</tr>`).join("")}</tbody>
          </table></div>` : ""}
        ${rows.length > size ? `<div class="direction-pager">
          <button type="button" class="btn btn-outline btn-small" data-direction-page="-1"${page === 0 ? " disabled" : ""}>Trang trước</button>
          <span>Trang ${page + 1}/${Math.ceil(rows.length / size)}</span>
          <button type="button" class="btn btn-outline btn-small" data-direction-page="1"${offset + size >= rows.length ? " disabled" : ""}>Trang sau</button>
        </div>` : ""}`;
    };
    const reset = () => { page = 0; renderPage(); };
    search.oninput = reset;
    filter.onchange = reset;
    table.onclick = async (event) => {
      const pager = event.target.closest("[data-direction-page]");
      const profile = event.target.closest("[data-direction-profile]");
      if (pager) {
        page += Number(pager.dataset.directionPage);
        renderPage();
        const next = $(`[data-direction-page="${pager.dataset.directionPage}"]:not(:disabled)`, table);
        (next || $(".table-wrap", table))?.focus({ preventScroll: true });
      }
      if (profile) {
        state.preset = "all";
        $$(".preset", $("#experiment-form")).forEach((button) => {
          const active = button.dataset.value === "all";
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        state.query = state.profile = profile.dataset.directionProfile;
        $("#profile-search").value = state.query;
        clearTimeout(searchTimer);
        $('[data-group="all"]').click();
        await loadProfiles();
        if (container.isConnected && container.comparisonRequest === request && $("#profile-select").value === profile.dataset.directionProfile)
          $("#experiment-form").requestSubmit();
      }
    };
    renderPage();
  } catch (error) {
    if (container.comparisonRequest === request) {
      container.innerHTML = errorBlock(error, "retry-directions");
      $("button", container).onclick = () => compareDirections(container, protocol);
    }
  }
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
      "So sánh H1, H2 và H3 trên toàn tập. Mở một hồ sơ để xem danh sách gợi ý cụ thể.",
    ) +
    `<section class="panel direction-cohort" aria-labelledby="direction-cohort-title">
      <div class="metrics-panel-head">
        <h2 id="direction-cohort-title">So sánh H1, H2, H3 trên ${num(b.audit.users)} hồ sơ</h2>
        <div><label for="direction-protocol">Tập ứng viên mỗi hồ sơ</label><select id="direction-protocol">${protocolOptions(state.protocol)}</select></div>
      </div>
      <button class="btn btn-outline btn-small" id="direction-jump-case" type="button">Thử dự đoán từng hồ sơ ↓</button>
      <div id="direction-cohort-results"></div>
    </section>
    <div class="section-heading"><h2>Thử dự đoán từng hồ sơ</h2></div>
    <form id="experiment-form" class="panel experiment-controls">
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
    $("#direction-protocol").value = state.protocol;
    invalidateCase();
    compareDirections($("#direction-cohort-results"), state.protocol);
  });
  $("#direction-protocol").onchange = (event) => {
    $("#experiment-protocol").value = event.target.value;
    $("#experiment-protocol").dispatchEvent(new Event("change"));
  };
  compareDirections($("#direction-cohort-results"), state.protocol);
  $("#direction-jump-case").onclick = () => $("#profile-search").focus();
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
function signedDelta(value, digits = 4) {
  const formatted = num(Math.abs(value), digits);
  return formatted === num(0, digits) ? formatted : `${value > 0 ? "+" : "−"}${formatted}`;
}
async function renderBenchmark(container, protocol) {
  container.innerHTML = loading("Đang tải kết quả toàn tập…");
  try {
    const { rows } = await getMetrics(protocol, "all");
    const baseline = rows.find((row) => row.model === "content");
    const best = Math.max(...rows.map((row) => row.ndcg10));
    const leaders = rows.filter((row) => row.ndcg10 === best).map((row) => model(row.model).name);
    const sorted = [...rows].sort((a, b) => b.ndcg10 - a.ndcg10);
    const hybrid = rows.find((row) => row.model === "h3");
    container.innerHTML = `
      <h3 id="benchmark-title">Mô hình nào tốt hơn trên toàn tập?</h3>
      <p class="benchmark-result"><strong>${leaders.length > 1 ? "Đồng hạng cao nhất" : "Cao nhất"} theo NDCG@10:</strong> ${h(leaders.join(" · "))} (${decimal(best)}).</p>
      <p>So sánh trên ${num(baseline.users)} hồ sơ · ${protocol === "sampled100" ? "100 ứng viên cố định" : "Toàn bộ danh mục"}. Mốc so sánh là mô hình Nội dung sản phẩm (TF-IDF/SVD).</p>
      ${scoreTiles([
        ["Mốc nội dung · Recall@10", pct(baseline.recall10)],
        ["H3 · Recall@10", pct(hybrid.recall10), `${signedDelta((hybrid.recall10 - baseline.recall10) * 100, 2)} điểm % so với mốc`],
      ])}
      ${bars(rows, "recall10")}
      <details class="disclosure"><summary>Xem chênh lệch so với mốc nội dung</summary>
      <div class="table-wrap" tabindex="0" role="region" aria-labelledby="benchmark-title">
        <table class="metrics-table benchmark-table">
          <thead><tr><th scope="col">Mô hình</th><th scope="col">Tìm trúng Top 10</th><th scope="col">Chênh lệch tỷ lệ trúng</th><th scope="col">NDCG@10</th><th scope="col">Chênh lệch NDCG</th></tr></thead>
          <tbody>${sorted.map((row) => `<tr class="${row.ndcg10 === best ? "best" : ""}">
            <th scope="row">${h(model(row.model).name)}${row.model === "content" ? " · Mốc" : ""}</th>
            <td class="metric-num">${num(row.hits10)}/${num(row.users)} (${pct(row.recall10)})</td>
            <td class="metric-num">${signedDelta((row.recall10 - baseline.recall10) * 100, 2)} điểm %</td>
            <td class="metric-num">${decimal(row.ndcg10)}</td>
            <td class="metric-num">${signedDelta(row.ndcg10 - baseline.ndcg10)}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="table-caption">Dấu + là cao hơn mốc, dấu − là thấp hơn. Đây là chênh lệch quan sát được trên tập kiểm tra.</p>
      </details>
      <a class="inline-link" href="#results">Xem độ phủ và khoảng tin cậy →</a>`;
  } catch {
    container.innerHTML = '<p role="alert">Chưa tải được kết quả toàn tập.</p><button type="button" class="btn btn-outline btn-small">Thử lại</button>';
    $("button", container).onclick = () => renderBenchmark(container, protocol);
  }
}
function comparisonSummary(data) {
  const supported = data.results.filter((result) => result.target_in_learned_output || result.uses_fallback);
  const best = Math.min(...supported.map((result) => result.rank));
  const leaders = supported.filter((result) => result.rank === best).map((result) => result.name);
  const hits = data.results.filter((result) => result.hit10).length;
  return `<section class="panel case-summary" aria-labelledby="case-summary-title">
    <h3 id="case-summary-title">Kết quả cho hồ sơ này</h3>
    ${scoreTiles([
      ["Mô hình tìm trúng Top 10", `${hits}/${data.results.length}`],
      ["Thứ hạng tốt nhất", leaders.length ? num(best) : "—",
        data.fallback ? "Dự phòng theo độ phổ biến" : leaders.join(" · ") || "Ngoài bộ sản phẩm đã học"],
      ["Sản phẩm ứng viên", num(data.candidate_count)],
    ])}
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
    <section class="panel case-summary" id="case-benchmark"></section>
    <h3 class="ranking-heading">Danh sách gợi ý theo mô hình</h3>
    <div class="comparison-grid compact-comparison">${data.results.map((result) => {
      const unsupported = result.target_in_learned_output === false && !result.uses_fallback;
      const badge = result.uses_fallback ? "Dự phòng theo độ phổ biến" : unsupported ? "Ngoài bộ sản phẩm đã học" : result.hit10 ? "Tìm trúng trong 10 kết quả" : "Chưa tìm trúng";
      return `<article class="model-card" id="ranking-${h(result.model)}" tabindex="-1"><header class="model-card-head"><div><span class="model-family">${h(model(result.model).family)}</span><h3>${h(result.name)}</h3></div></header><div class="compact-score"><span class="hit-badge ${result.hit10 ? "" : "miss-badge"}">${badge}</span><p>${unsupported ? "Không có đầu ra đã học" : `Hạng ${num(result.rank)} / ${num(data.candidate_count)}`}<span>NDCG ${decimal(result.ndcg10)}</span></p></div><ol class="ranking-list">${result.top10.slice(0, 5).map(itemRow).join("")}</ol><details class="ranking-more"><summary>Xem hạng 6–10</summary><ol class="ranking-list">${result.top10.slice(5).map(itemRow).join("")}</ol></details></article>`;
    }).join("")}</div>
    <details class="disclosure"><summary>Lịch sử và thông tin thực nghiệm · ${data.history.length} tương tác</summary><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Sản phẩm</th><th>Mốc tương tác</th></tr></thead><tbody>${data.history.map((item) => `<tr><td class="wrap-cell">${h(item.title)}</td><td>${num(item.timestamp)}</td></tr>`).join("") || '<tr><td colspan="2">Hồ sơ này chưa có tương tác trước thời điểm kiểm tra.</td></tr>'}</tbody></table></div><p>Chỉ dùng lịch sử trước mốc ${num(data.cutoff)}; đơn vị thời gian chưa được xác minh. Sản phẩm thực tế thuộc tập kiểm tra.</p><p>Đối chiếu điểm dự đoán đã lưu, không huấn luyện lại. Mã ${h(data.run_id)} · Xếp hạng máy chủ ${num(data.server_ms, 2)} ms.</p></details>`;
  renderBenchmark($("#case-benchmark"), data.protocol);
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
        `<section class="panel research-results-visual" aria-labelledby="metric-chart-title">
          <div><div class="metrics-panel-head">
            <h2 id="metric-chart-title">So sánh mô hình</h2>
            <div><label for="metrics-order">Chỉ số so sánh</label><select id="metrics-order">${options([
              ["ndcg10", "Điểm thứ hạng"],
              ["recall10", "Tỷ lệ tìm trúng"],
              ["coverage10", "Độ phủ sản phẩm"],
            ], state.metricOrder)}</select></div>
          </div><div id="metric-chart"></div></div>
          <div class="research-insight" id="metric-insight" aria-live="polite"></div>
        </section>
        <div class="panel"><h2>Chỉ số mô hình chính</h2><div id="ordered-metrics"></div><p class="table-caption">Tìm trúng / số người dùng: số trường hợp dự đoán đúng trong 10 kết quả đầu trên tổng số người được đánh giá.</p></div><details class="disclosure"><summary>Ý nghĩa các chỉ số</summary>${metricLegend()}</details><details class="disclosure"><summary>Khoảng tin cậy của điểm thứ hạng</summary><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Mô hình</th><th>NDCG@10</th><th>Khoảng tin cậy 95%</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${h(model(r.model).name)}</td><td>${decimal(r.ndcg10)}</td><td>${decimal(r.ndcg_ci_low)} – ${decimal(r.ndcg_ci_high)}</td></tr>`).join("")}</tbody></table></div><p class="table-caption">${h(state.study.evaluation.bootstrap)}</p></details><div class="notice notice-warning"><strong>Cấu hình hiện tại.</strong> H2 sử dụng LightGCN và TF-IDF/SVD, chưa triển khai MiniLM. H3 có kết quả trùng mô hình đối chứng theo nội dung.</div><details class="disclosure"><summary>Cấu hình phụ và chênh lệch chỉ số</summary><div>${metricsTable(
          data.rows.filter(
            (r) => !state.bootstrap.default_models.includes(r.model),
          ),
          true,
        )}${data.contrasts.length ? `<h4 style="margin-top:20px">Chênh lệch NDCG so với mô hình đối chứng theo nội dung</h4><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Mô hình</th><th>Δ NDCG</th><th>Khoảng tin cậy 95% theo cặp</th></tr></thead><tbody>${data.contrasts.map((r) => `<tr><td>${h(model(r.model).name)}</td><td class="metric-num">${decimal(r.ndcg_delta)}</td><td class="metric-num">${decimal(r.ci_low)} – ${decimal(r.ci_high)}</td></tr>`).join("")}</tbody></table></div><p class="table-caption">Chênh lệch được tính trên cùng người dùng; chưa hiệu chỉnh nhiều phép so sánh.</p>` : ""}</div></details>`;
      const order = $("#metrics-order");
      const renderTable = () => {
        state.metricOrder = order.value;
        const sorted = [...data.rows].sort((a, b) => b[state.metricOrder] - a[state.metricOrder]);
        const view = metricViews[state.metricOrder];
        const best = sorted[0][state.metricOrder];
        const leaders = sorted.filter((row) => row[state.metricOrder] === best);
        const reference = rows.find((row) => row.model === "content")[state.metricOrder];
        const difference = best - reference;
        const delta = state.metricOrder === "ndcg10"
          ? signedDelta(difference) : `${signedDelta(difference * 100, 2)} điểm %`;
        $("#metric-chart-title").textContent = `So sánh ${view.label}`;
        $("#metric-chart").innerHTML = bars(sorted, state.metricOrder);
        $("#metric-insight").innerHTML = `
          <p>${leaders.length > 1 ? "Đồng hạng cao nhất" : "Cao nhất"} · ${view.title}</p>
          <strong>${view.format(best)}</strong>
          <p>${h(leaders.map((row) => model(row.model).short).join(" · "))}</p>
          <p class="research-insight-delta">${delta} so với mốc nội dung</p>`;
        $("#ordered-metrics").innerHTML = metricsTable(coreRows(sorted), false, state.metricOrder);
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
    `<section id="discussion-evidence" class="panel research-evidence">${loading()}</section>
    <div class="section-heading"><div><h2>Nhận xét từng mô hình</h2></div></div>
    <div class="research-review-list">${discussionData.map((x, index) => `
      <details class="panel research-review"${index === 0 ? " open" : ""}>
        <summary><span class="research-reference">${h(x.family)}</span><strong>${h(x.title)}</strong></summary>
        <dl><div><dt>Điểm mạnh</dt><dd>${h(x.strength)}</dd></div><div><dt>Hạn chế</dt><dd>${h(x.limit)}</dd></div><div><dt>Cải tiến</dt><dd>${h(x.next)}</dd></div></dl>
      </details>`).join("")}</div><div class="section-heading"><div><h2>Thứ tự ưu tiên cải tiến</h2></div></div><div class="priority-list">${[
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
    $("#discussion-evidence").innerHTML = `
      <div><h2>Bằng chứng từ toàn danh mục</h2>
        <p>Đối chứng nội dung tìm trúng ${num(text.hits10)} trên ${num(text.users)} hồ sơ. Trọng số đồ thị trong H2 kết hợp là ${num(state.bootstrap.audit.h2_graph_weight, 2)}.</p>
        <a class="inline-link" href="#results">Đối chiếu kết quả →</a>
      </div>
      <div>${scoreTiles([
        ["Nội dung · toàn tập", pct(text.recall10), `NDCG ${decimal(text.ndcg10)}`],
        [`${model(bestH1.model).short} · nhóm đã học`, pct(bestH1.recall10), `${num(bestH1.users)} hồ sơ`],
        ["Nội dung · nhóm chưa học", pct(coldText.recall10), `${num(coldText.users)} hồ sơ`],
      ])}</div>`;  } catch (err) {
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
    <ol class="research-workflow">${study.evaluation.workflow.map(({ title, description }) => `<li><h3>${h(title)}</h3><p>${h(description)}</p></li>`).join("")}</ol>
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
  <div class="data-breakdown"><div class="panel"><h3>Sản phẩm thực tế trong tập kiểm tra</h3>
    <div class="research-distribution" aria-hidden="true"><span style="width:${data.warm_targets / a.users * 100}%"></span></div>
    <dl class="study-counts"><dt>Đã có tương tác huấn luyện</dt><dd>${num(data.warm_targets)} / ${num(a.users)}</dd><dt>Chưa có tương tác huấn luyện</dt><dd>${num(data.cold_targets)} / ${num(a.users)}</dd></dl></div><div class="panel"><h3>Lịch sử trước thời điểm kiểm tra</h3><dl class="study-counts">${data.history_groups.map((x) => `<dt>${h(x.label)}</dt><dd>${num(x.users)} người</dd>`).join("")}</dl></div></div>
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
const shop = {
  cart: new Map(),
  checkoutKey: null,
  pending: false,
};
const storeRoutes = {
  "popularity-control-v1": "Độ phổ biến · nhóm đối chứng",
  "popularity-fallback-v1": "Độ phổ biến · khách mới",
  "content-onboarding-v1": "Gợi ý theo sản phẩm quan tâm",
  "validated-ranking-v1": "Xếp hạng từ điểm đã lưu",
};
const storePhoto = {
  "Chăm sóc da": "skin",
  "Trang điểm": "makeup",
  "Chăm sóc tóc": "hair",
  "Chăm sóc móng": "nail",
  "Cọ & dụng cụ": "tools",
};
const beautyPhoto = (group) => `<span class="beauty-shot beauty-${storePhoto[group] || "collection"}" aria-hidden="true"></span>`;
const shopMoney = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND",
}).format(value);
const storePost = (path, data) => api(`/api/store/${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

async function storefront() {
  $("#main").innerHTML = `
    <section class="store-hero" aria-labelledby="store-title">
      <div class="store-hero-copy">
        <span class="store-kicker">CỬA HÀNG MÔ PHỎNG</span>
        <h1 id="store-title">Gợi ý mỹ phẩm<br>cho riêng bạn</h1>
        <p>Chọn sản phẩm từ bộ dữ liệu Amazon All Beauty và trải nghiệm đặt hàng với giá, tồn kho mô phỏng.</p>
        <div class="store-tools">
          <button type="button" class="btn" id="store-start">Khám phá danh mục <span aria-hidden="true">↓</span></button>
          <button type="button" class="btn store-hero-secondary" id="store-ops-link">Xem vận hành</button>
        </div>
      </div>
      <div class="store-hero-image"><img src="/static/beauty-editorial.webp" alt="" width="1440" height="960" fetchpriority="high"></div>
    </section>
    <div id="store-workspace" tabindex="-1"></div>`;
  $("#store-start").onclick = () => ($("[data-store-category]") || $("#store-profile") || $("#store-workspace")).focus();
  $("#store-ops-link").onclick = () => ($("#store-ops-title") || $("#store-workspace")).focus();
  const root = $("#store-workspace");
  root.innerHTML = loading("Đang chuẩn bị cửa hàng…");
  try {
    const config = await api("/api/store/session");
    if (!root.isConnected) return;
    if (config.new_session) {
      shop.cart.clear();
      shop.checkoutKey = null;
    }
    root.innerHTML = `
      <section class="store-browse" aria-labelledby="store-browse-title">
        <h2 id="store-browse-title">Khám phá theo danh mục</h2>
        <div class="store-categories">
          ${Object.keys(storePhoto).filter((group) => config.groups.includes(group)).map((group) => `
            <button type="button" data-store-category="${h(group)}" aria-pressed="false">
              <span class="store-category-image">${beautyPhoto(group)}</span>
              <span>${h(group)} <span aria-hidden="true">→</span></span>
            </button>`).join("")}
        </div>
      </section>
      <div class="store-layout">
        <section class="panel store-section" aria-labelledby="store-recommend-title">
          <h2 id="store-recommend-title">Gợi ý sản phẩm</h2>
          <form id="store-recommend">
            <div class="store-fields">
              <div><label for="store-profile">Hồ sơ</label><select id="store-profile">${options([["Khách mới", "Khách mới"], ...config.profiles.map((id) => [id, id])], "Khách mới")}</select></div>
              <div><label for="store-group">Nhóm sản phẩm</label><select id="store-group">${options(["Tất cả", ...config.groups].map((group) => [group, group]), "Tất cả")}</select></div>
            </div>
            <label for="store-seed">Sản phẩm quan tâm (tùy chọn)</label>
            <select id="store-seed">${options([["", "Chưa chọn sản phẩm"], ...config.seeds.map((item) => [item.item_id, item.title])], "")}</select>
            <div class="store-tools store-form-actions">
              <button class="btn" type="submit">Xem gợi ý</button>
              <button class="btn btn-outline" type="button" id="store-cart-link">Giỏ hàng</button>
            </div>
          </form>
          <div id="store-recommendations"><p>Chọn hồ sơ rồi xem những sản phẩm đang bán và còn hàng.</p></div>
        </section>
        <section class="panel store-section store-cart-panel" aria-labelledby="store-cart-title">
          <h2 id="store-cart-title" tabindex="-1">Giỏ hàng thử</h2>
          <div id="store-cart"></div>
          <p id="store-order"></p>
          <button type="button" class="btn btn-outline" id="store-order-link" hidden>Đối chiếu đơn và tồn kho →</button>
        </section>
      </div>
      <section class="panel store-section" aria-labelledby="store-ops-title">
        <h2 id="store-ops-title" tabindex="-1">Vận hành và đối chiếu</h2>
        <p>Tồn kho và nhật ký chỉ thuộc phiên trình duyệt này. Dữ liệu thử hết hạn sau 4 giờ hoặc khi máy chủ khởi động lại.</p>
        <div class="store-tools">
          <a class="btn btn-outline" href="/api/store/inventory.csv">Tải tồn kho CSV</a>
          <a class="btn btn-outline" href="/api/store/events.csv">Tải nhật ký sự kiện</a>
          <button class="btn btn-outline" id="store-refresh" type="button">Làm mới số liệu</button>
        </div>
        <form id="store-experiment" class="store-action-row">
          <label><input type="checkbox" id="store-ab" ${config.experiment_enabled ? "checked" : ""}> Bật phân nhóm A/B mô phỏng cho lượt gợi ý tiếp theo</label>
          <button class="btn btn-outline btn-small" type="submit">Lưu</button>
        </form>
        <details class="disclosure"><summary>Nhập snapshot tồn kho thử</summary>
          <p>Dùng các cột item_id, stock, price, active. Mã bị bỏ khỏi tệp sẽ ngừng bán trong phiên này.</p>
          <form id="store-inventory" class="store-action-row">
            <div><label for="store-csv">Tệp tồn kho CSV</label><input id="store-csv" type="file" accept=".csv,text/csv" required></div>
            <button class="btn btn-outline btn-small" type="submit">Cập nhật tồn kho</button>
          </form>
        </details>
        <div id="store-operations">${loading()}</div>
      </section>
      <p class="notice notice-error" id="store-error" role="alert" hidden></p>
      <p class="screen-reader" id="store-announcement" role="status"></p>
      <button type="button" id="store-cart-dock" class="store-cart-dock" hidden>
        <span></span><strong></strong>
      </button>
      <dialog class="store-product-dialog" aria-labelledby="store-dialog-title">
        <div class="store-dialog-content"></div>
      </dialog>`;

    const find = (selector) => $(selector, root);
    const fail = (error) => {
      const alert = find(".store-product-dialog[open] [role=alert]") || find("#store-error");
      alert.hidden = false;
      alert.textContent = error.message;
      alert.scrollIntoView({ block: "nearest" });
    };
    const act = async (job) => {
      if (shop.pending) return;
      shop.pending = true;
      $$("[role=alert]", root).forEach((alert) => { alert.hidden = true; });
      const buttons = $$("button", root).filter((button) => !button.disabled && !button.hidden);
      buttons.forEach((button) => { button.disabled = true; });
      try {
        await job();
      } catch (error) {
        fail(error);
      } finally {
        shop.pending = false;
        buttons.forEach((button) => { button.disabled = false; });
      }
    };

    function cartView() {
      const lines = [...shop.cart.values()];
      const quantity = lines.reduce((sum, item) => sum + item.quantity, 0);
      const total = lines.reduce((sum, item) => sum + item.quantity * item.price, 0);
      find("#store-cart-link").textContent = `Giỏ hàng (${num(quantity)})`;
      const dock = find("#store-cart-dock");
      dock.hidden = !quantity;
      $("span", dock).textContent = `Xem giỏ · ${num(quantity)} sản phẩm`;
      $("strong", dock).textContent = shopMoney(total);
      find("#store-cart").innerHTML = lines.length ? `
        <ul class="store-cart-list">${lines.map((item) => `<li>
          <div class="store-cart-thumbnail">${beautyPhoto(item.group)}</div>
          <div class="store-cart-line">
            <strong>${h(item.title)}</strong>
            <span>${shopMoney(item.price)}</span>
            <div class="store-quantity" role="group" aria-label="Số lượng ${h(item.title)}">
              <button type="button" data-quantity="-1" data-item="${h(item.item_id)}" aria-label="Giảm số lượng"${item.quantity === 1 ? " disabled" : ""}>−</button>
              <span>${num(item.quantity)}</span>
              <button type="button" data-quantity="1" data-item="${h(item.item_id)}" aria-label="Tăng số lượng"${item.quantity >= Math.min(99, item.stock) ? " disabled" : ""}>+</button>
            </div>
          </div>
          <button type="button" class="btn btn-outline btn-small" data-remove="${h(item.item_id)}" aria-label="Bỏ ${h(item.title)}">Bỏ</button>
        </li>`).join("")}</ul>
        <p class="store-cart-total"><span>Tạm tính</span><strong>${shopMoney(total)}</strong></p>
        <button type="button" class="btn" id="store-checkout">Tạo đơn thử <span aria-hidden="true">→</span></button>` :
        '<div class="store-cart-empty"><span aria-hidden="true">＋</span><p>Giỏ hàng đang trống.</p></div>';
    }

    let operationsGeneration = 0;
    async function loadOperations() {
      const generation = ++operationsGeneration;
      const data = await api("/api/store/operations");
      if (generation !== operationsGeneration || !root.isConnected) return;
      const steps = [
        ["Hiển thị SKU", "impressions"], ["Nhấp", "clicks"],
        ["Thêm giỏ", "add_to_cart"], ["SKU có đơn", "purchase_items"],
      ];
      const counts = steps.map(([label, key]) => [label, data.funnel.reduce((sum, row) => sum + row[key], 0)]);
      const scale = Math.max(1, ...counts.map(([, count]) => count));
      find("#store-operations").innerHTML = `
        <h3>Đối chiếu đơn hàng</h3>
        <p>${num(data.sellable)} mã còn hàng và đang bán · ${data.inventory_source === "operator_csv" ? "Tồn kho từ CSV" : "Tồn kho mẫu"}</p>
        ${data.orders.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Đơn thử và tồn kho"><table class="metrics-table">
          <thead><tr><th>Đơn</th><th>Sản phẩm</th><th>Số lượng</th><th>Còn trong kho</th><th>Tổng đơn</th></tr></thead>
          <tbody>${data.lines.map((line) => `<tr><td>${h(line.order_id)}</td><td class="wrap-cell">${h(line.title)}</td><td>${num(line.quantity)}</td><td>${num(line.stock)}</td><td>${shopMoney(data.orders.find((order) => order.id === line.order_id).total)}</td></tr>`).join("")}</tbody></table></div>` : "<p>Chưa có đơn thử.</p>"}
        <h3>Phễu hành vi mô phỏng</h3>
        <dl class="store-funnel">${counts.map(([label, count]) => `<div><dt>${label}</dt><dd>${num(count)}<span class="store-funnel-track" aria-hidden="true"><span style="width:${count / scale * 100}%"></span></span></dd></div>`).join("")}</dl>
        ${data.funnel.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Phễu thử nghiệm"><table class="metrics-table">
          <thead><tr><th>Nhóm</th><th>Lượt gợi ý</th><th>Hiển thị SKU</th><th>Nhấp</th><th>Thêm giỏ</th><th>SKU có đơn</th><th>CTR</th></tr></thead>
          <tbody>${data.funnel.map((row) => `<tr><td>${h(({ personalized: "Cá nhân hóa", control: "Đối chứng A", treatment: "Gợi ý B" })[row.variant])}</td><td>${num(row.requests)}</td><td>${num(row.impressions)}</td><td>${num(row.clicks)}</td><td>${num(row.add_to_cart)}</td><td>${num(row.purchase_items)}</td><td>${pct(row.CTR)}</td></tr>`).join("")}</tbody></table></div>` : "<p>Chưa có lượt gợi ý.</p>"}
        <p class="table-caption">Các lượt thử trong phiên dùng để kiểm tra ghi nhận sự kiện. Nhóm A/B giữ nguyên cho cùng một phiên.</p>`;
    }

    const refreshAfterChange = () => loadOperations().catch((error) => {
      if (root.isConnected) fail(error);
    });
    let current = null;
    const track = (id, event) => storePost("events", {
      item_id: id, event, request_id: current.request_id,
    });
    const selectGroup = find("#store-group");
    const categoryButtons = $$("[data-store-category]", root);
    const syncCategories = () => categoryButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.storeCategory === selectGroup.value));
    });
    selectGroup.onchange = syncCategories;
    categoryButtons.forEach((button) => {
      button.onclick = () => {
        selectGroup.value = button.dataset.storeCategory;
        syncCategories();
        find("#store-recommend").requestSubmit();
      };
    });
    find("#store-recommend").onsubmit = (event) => {
      event.preventDefault();
      act(async () => {
        current = await storePost("recommendations", {
          profile: find("#store-profile").value, group: find("#store-group").value,
          seed: find("#store-seed").value, cart_ids: [...shop.cart.keys()],
        });
        find("#store-recommendations").innerHTML = `
          <div class="store-results-head"><div><h3 tabindex="-1">Sản phẩm gợi ý</h3><p class="store-route">${h(storeRoutes[current.route])} · ${num(current.items.length)} sản phẩm</p></div>
          ${current.items.length ? '<small>Ảnh minh họa theo danh mục</small>' : ""}</div>
          ${current.items.length ? `<div class="store-products">${current.items.map((item) => `<article>
            <div class="store-product-image">${beautyPhoto(item.group)}</div>
            <div class="store-product-copy">
            <small class="store-product-category">${h(item.group)}</small><h3 title="${h(item.title)}">${h(item.title)}</h3>
            <p class="store-product-meta"><strong>${shopMoney(item.price)}</strong><span>Còn ${num(item.stock)}</span></p>
            <div class="store-tools"><button type="button" class="btn btn-outline btn-small" data-detail="${h(item.item_id)}" aria-haspopup="dialog">Chi tiết</button>
            <button type="button" class="btn btn-small" data-add="${h(item.item_id)}">Thêm giỏ</button></div>
            </div>
          </article>`).join("")}</div>` : "<p>Không có sản phẩm khả dụng với lựa chọn này.</p>"}`;
        find(".store-results-head h3").focus();
        refreshAfterChange();
      });
    };
    const dialog = find(".store-product-dialog");
    const addToCart = (item) => act(async () => {
      const quantity = (shop.cart.get(item.item_id)?.quantity || 0) + 1;
      if (quantity > Math.min(99, item.stock)) throw Error("Số lượng đã đạt giới hạn tồn kho.");
      if (!shop.cart.has(item.item_id) && shop.cart.size >= 30) throw Error("Giỏ thử hỗ trợ tối đa 30 mã sản phẩm.");
      await track(item.item_id, "click");
      await track(item.item_id, "cart");
      shop.cart.set(item.item_id, { ...item, quantity, request_id: current.request_id });
      shop.checkoutKey = null;
      find("#store-order-link").hidden = true;
      find("#store-order").textContent = "";
      find("#store-announcement").textContent = `Đã thêm ${item.title} vào giỏ.`;
      if (dialog.open) dialog.close();
      cartView();
      refreshAfterChange();
    });

    find("#store-recommendations").onclick = (event) => {
      const button = event.target.closest("[data-add], [data-detail]");
      if (!button || !current) return;
      const id = button.dataset.add || button.dataset.detail;
      const item = current.items.find((entry) => entry.item_id === id);
      if (button.dataset.add) {
        addToCart(item);
        return;
      }
      act(async () => {
        await track(id, "click");
        if (!root.isConnected) return;
        find(".store-dialog-content").innerHTML = `
          <div class="store-dialog-image">${beautyPhoto(item.group)}</div>
          <div class="store-dialog-copy">
            <button class="btn btn-outline btn-small" type="button" data-dialog-close autofocus>Đóng</button>
            <p class="store-product-category">${h(item.group)} · Ảnh minh họa</p>
            <h2 id="store-dialog-title">${h(item.title)}</h2>
            <p>Mã sản phẩm ${h(item.item_id)} · Còn ${num(item.stock)}</p>
            <p class="store-dialog-price">${shopMoney(item.price)}</p>
            <button type="button" class="btn" data-dialog-add>Thêm giỏ</button>
            <p class="notice notice-error" role="alert" hidden></p>
          </div>`;
        dialog.showModal();
        find("[data-dialog-close]").onclick = () => dialog.close();
        find("[data-dialog-add]").onclick = () => addToCart(item);
        refreshAfterChange();
      });
    };
    find("#store-cart").onclick = (event) => {
      const adjustment = event.target.closest("[data-quantity]");
      if (adjustment && !shop.pending) {
        const item = shop.cart.get(adjustment.dataset.item);
        item.quantity += Number(adjustment.dataset.quantity);
        shop.checkoutKey = null;
        cartView();
        const controls = $$("[data-quantity]", find("#store-cart"));
        const matching = controls.filter((button) => button.dataset.item === item.item_id && !button.disabled);
        (matching.find((button) => button.dataset.quantity === adjustment.dataset.quantity) || matching[0])?.focus();
      }
      const remove = event.target.closest("[data-remove]");
      if (remove && !shop.pending) {
        shop.cart.delete(remove.dataset.remove);
        shop.checkoutKey = null;
        cartView();
      }
      if (event.target.closest("#store-checkout")) act(async () => {
        shop.checkoutKey ||= crypto.randomUUID();
        const order = await storePost("orders", {
          checkout_key: shop.checkoutKey,
          cart: Object.fromEntries([...shop.cart].map(([id, item]) => [id, {
            quantity: item.quantity, request_id: item.request_id,
          }])),
        });
        shop.cart.clear();
        shop.checkoutKey = null;
        current = null;
        cartView();
        find("#store-order").textContent = `Đã tạo đơn thử ${order.id}. Tồn kho đã cập nhật.`;
        find("#store-announcement").textContent = find("#store-order").textContent;
        find("#store-order-link").hidden = false;
        find("#store-order-link").focus();
        find("#store-recommendations").textContent = "Chọn Xem gợi ý để đọc tồn kho mới.";
        refreshAfterChange();
      });
    };
    find("#store-cart-link").onclick = () => find("#store-cart-title").focus();
    find("#store-cart-dock").onclick = () => find("#store-cart-title").focus();
    find("#store-order-link").onclick = () => find("#store-ops-title").focus();
    find("#store-refresh").onclick = () => act(loadOperations);
    find("#store-experiment").onsubmit = (event) => {
      event.preventDefault();
      act(async () => {
        const { enabled } = await storePost("experiment", { enabled: find("#store-ab").checked });
        find("#store-order").textContent = enabled ? "Đã bật phân nhóm A/B." : "Đã tắt phân nhóm A/B.";
      });
    };
    find("#store-inventory").onsubmit = (event) => {
      event.preventDefault();
      act(async () => {
        const file = find("#store-csv").files[0];
        if (file.size > 250_000) throw Error("Tệp vượt giới hạn 250 KB.");
        const { imported } = await storePost("inventory", { csv: await file.text() });
        shop.cart.clear();
        shop.checkoutKey = null;
        if (!root.isConnected) return;
        await storefront();
        const status = $("#store-order");
        if (status) status.textContent = `Đã nhập tồn kho cho ${num(imported)} mã sản phẩm.`;
      });
    };
    cartView();
    try {
      await loadOperations();
    } catch (error) {
      fail(error);
    }
  } catch (error) {
    root.innerHTML = errorBlock(error);
  }
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
  $("#main").classList.toggle("research-workspace", state.route !== "store");
  $("#main").dataset.view = state.route;
  $$("[data-nav]").forEach((el) => {
    if (el.dataset.nav === state.route) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  setMenu(false);
  window.scrollTo(0, 0);
  ({ overview, experiment, results, discussion, method: methodology, store: storefront })[
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
