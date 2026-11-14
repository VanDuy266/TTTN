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
  overview: "Tổng quan",
  experiment: "Chạy đối chiếu",
  results: "Kết quả toàn tập",
  discussion: "Hạn chế & hướng đi",
  method: "Quy trình & tái lập",
};
const state = {
  bootstrap: null,
  route: "overview",
  profile: "",
  query: "",
  preset: "all",
  protocol: "full_catalog",
  cohort: "all",
  selected: [],
  case: null,
  reveal: false,
  metrics: new Map(),
  generation: 0,
  profileGeneration: 0,
  running: false,
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
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function heading(label, title, description, extra = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${h(label)}</div><h1>${h(title)}</h1><p>${h(description)}</p></div>${extra}</div>`;
}
function loading(text = "Đang đọc kết quả đã kiểm chứng…") {
  return `<div class="loading-inline" role="status"><span class="spinner"></span>${h(text)}</div>`;
}
function errorBlock(err) {
  return `<div class="notice notice-error" role="alert">${h(err.message)}<div><button class="btn btn-outline btn-small error-retry" data-action="retry">Thử lại</button></div></div>`;
}
function model(id) {
  return state.bootstrap.models.find((x) => x.id === id);
}
function coreRows(rows) {
  return rows.filter((r) => state.bootstrap.default_models.includes(r.model));
}
function metricsTable(rows, full = false) {
  const best = Math.max(...coreRows(rows).map((x) => x.ndcg10));
  return `<div class="table-wrap"><table class="metrics-table"><caption class="screen-reader">Chỉ số đánh giá thực nghiệm trên cùng tập người dùng và ứng viên</caption><thead><tr><th>Mô hình</th><th>Users</th><th>Recall@10</th><th>NDCG@10</th><th>Coverage@10</th>${full ? "<th>CI 95% · NDCG</th>" : ""}</tr></thead><tbody>${rows.map((r) => `<tr class="${r.ndcg10 === best ? "best" : ""}"><td>${h(model(r.model).name)}${r.ndcg10 === best ? '<span class="best-label">Cao nhất lần chạy</span>' : ""}<span class="metric-sub">${h(model(r.model).family)}</span></td><td>${num(r.users)}</td><td class="metric-num">${pct(r.recall10)}</td><td class="metric-num">${decimal(r.ndcg10)}</td><td class="metric-num">${pct(r.coverage10)}</td>${full ? `<td class="metric-num">${decimal(r.ndcg_ci_low)} – ${decimal(r.ndcg_ci_high)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
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
function metricLegend() {
  return `<div class="metric-legend"><div><h4>Recall@10</h4><p>Tỷ lệ người dùng có sản phẩm mục tiêu nằm trong top 10. Mỗi người có một mục tiêu test.</p></div><div><h4>NDCG@10</h4><p>Thưởng cao hơn khi mục tiêu xuất hiện ở vị trí đầu. Không phải chỉ số đa dạng.</p></div><div><h4>Coverage@10</h4><p>Tỷ lệ trong 2.934 sản phẩm xuất hiện trong các danh sách top 10 của nhóm được đánh giá.</p></div></div>`;
}
function overview() {
  const b = state.bootstrap,
    a = b.audit;
  $("#main").innerHTML =
    `<section class="hero"><div><div class="eyebrow">NHÓM DAD / THỰC TẬP TỐT NGHIỆP</div><h1>Từ lịch sử tương tác<br>đến <em>bằng chứng thực nghiệm.</em></h1><p>Kiểm tra mô hình gợi ý sản phẩm trên Amazon All Beauty. Xem lịch sử, so sánh H1–H2 và đối chiếu sản phẩm giữ lại trong test — trên cùng dữ liệu, cùng điều kiện.</p><div class="hero-actions"><a href="#experiment" class="btn btn-lime">Bắt đầu đối chiếu <span>↗</span></a><a href="#method" class="btn btn-ghost">Xem quy trình</a></div></div><div class="hero-orbit" aria-hidden="true"><div class="orbit-ring"></div><div class="pipeline"><div class="pipeline-node"><span>01</span>Lịch sử trước mục tiêu</div><div class="pipeline-node"><span>02</span>H1 · GRU & H2 · Graph + Text</div><div class="pipeline-node"><span>03</span>Top 10 → đối chiếu → kết luận</div></div></div></section>
<div class="stats"><div class="stat"><div class="stat-label">Hồ sơ kiểm chứng</div><div class="stat-value">${num(a.users)}</div><small>Mỗi hồ sơ có một mục tiêu test</small></div><div class="stat"><div class="stat-label">Danh mục đánh giá</div><div class="stat-value">${num(a.catalog)}</div><small>${num(a.train_items)} sản phẩm có trong train</small></div><div class="stat"><div class="stat-label">Tương tác được học</div><div class="stat-value">${num(a.train_rows)}</div><small>Đã bỏ ${num(a.excluded_ambiguous_train_rows)} mốc nhập nhằng</small></div><div class="stat"><div class="stat-label">Mục tiêu chưa có tương tác train</div><div class="stat-value">${num((a.cold_test_targets / a.test_rows) * 100, 1)}<span class="small">%</span></div><small>${num(a.cold_test_targets)} / ${num(a.test_rows)} mục tiêu cold-item</small></div></div>
<div class="section-heading"><div><h2>Hai hướng, một bài toán chung.</h2><p>H1 có ba biến thể M1/M2/M3. H2 khai thác đồ thị kết hợp nội dung.</p></div><span class="section-tag">RESEARCH SCOPE</span></div><div class="two-col"><article class="panel research-panel"><div class="panel-index"><span>HƯỚNG 01</span><span>SEQUENCE × TIME</span></div><h3>Thứ tự và khoảng cách thời gian<br>có giúp dự đoán tốt hơn?</h3><p>Đặt GRU cơ sở, Time Gap và Time Decay cạnh nhau trên cùng người dùng. Kiểm tra lợi ích của tín hiệu thời gian bằng số liệu, có cả trường hợp dự đoán sai.</p><div class="tags"><span class="tag">M1 · GRU4Rec</span><span class="tag">M2 · Time Gap</span><span class="tag">M3 · Time Decay</span></div></article><article class="panel research-panel"><div class="panel-index"><span>HƯỚNG 02</span><span>GRAPH × TEXT</span></div><h3>Quan hệ tương tác và nội dung<br>hỗ trợ sản phẩm mới ra sao?</h3><p>So sánh LightGCN + đặc trưng tiêu đề với baseline nội dung. Tách sản phẩm đã có và chưa có trong train; công bố đúng bộ mã hóa đang được sử dụng.</p><div class="tags"><span class="tag tag-blue">LightGCN · BPR</span><span class="tag tag-blue">TF-IDF / SVD</span><span class="tag tag-blue">MiniLM · Chưa chạy</span></div></article></div>
<div class="section-heading"><div><h2>Đi qua một thực nghiệm</h2><p>Mỗi dự đoán đều nối được với lịch sử và mục tiêu được giữ lại.</p></div><a class="inline-link" href="#experiment">Chọn hồ sơ ↗</a></div><div class="step-row"><div class="step-card"><span class="step-num">01</span><div><h4>Xem dữ liệu đầu vào</h4><p>Chỉ dùng tương tác trước mốc test, không đưa mục tiêu vào lịch sử.</p></div></div><div class="step-card"><span class="step-num">02</span><div><h4>Đặt mô hình cạnh nhau</h4><p>Cùng một hồ sơ và một tập ứng viên; xem top 10 của từng mô hình.</p></div></div><div class="step-card"><span class="step-num">03</span><div><h4>Mở mục tiêu và đối chiếu</h4><p>Kiểm tra tìm trúng, thứ hạng, rồi xem kết quả trên toàn tập.</p></div></div></div>
<div class="section-heading"><div><h2>Kết quả toàn danh mục</h2><p>Không lấy kết quả 100 ứng viên để mô tả toàn bộ catalog.</p></div><a href="#results" class="inline-link">Xem đầy đủ ↗</a></div><div id="overview-metrics" class="panel">${loading()}</div><div class="notice"><strong>Điều cần phân biệt.</strong> Web xếp hạng từ điểm đã lưu sau huấn luyện, không huấn luyện lại khi bấm nút. Chưa có bằng chứng mô hình lai vượt baseline nội dung hay tăng hiệu quả kinh doanh.</div>`;
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
      "01 / ĐỐI CHIẾU MỘT HỒ SƠ",
      "Một lịch sử. Nhiều mô hình. Cùng điều kiện.",
      "Chọn hồ sơ test, xem top 10 rồi mở sản phẩm mục tiêu để kiểm chứng.",
    ) +
    `<form id="experiment-form" class="panel experiment-controls"><div class="control-grid"><div><label for="profile-search">Tìm mã hồ sơ</label><input id="profile-search" placeholder="Ví dụ: KH-0020" value="${h(state.query)}" autocomplete="off"></div><div><label for="profile-select">Hồ sơ trong tập test</label><select id="profile-select" required><option value="">Đang đọc hồ sơ…</option></select></div><div><label for="experiment-protocol">Không gian đánh giá</label><select id="experiment-protocol">${protocolOptions(state.protocol)}</select></div><button type="submit" class="btn" id="run-button">Chạy đối chiếu <span>→</span></button></div><div class="profile-feedback" id="profile-feedback">Đang tải danh sách…</div><div class="presets"><span>Trường hợp cần xem:</span>${[
      ["all", "Tất cả"],
      ["warm", "Sản phẩm đã học"],
      ["cold", "Sản phẩm chưa học"],
      ["long", "Lịch sử ≥ 10"],
      ["empty", "Không có lịch sử trước mốc"],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" class="preset ${state.preset === value ? "active" : ""}" data-action="preset" data-value="${value}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="model-options"><span class="models-label">Mô hình đối chiếu</span>${b.models
      .filter((x) => b.default_models.includes(x.id))
      .map(
        (m) =>
          `<label class="model-option"><input type="checkbox" name="model" value="${m.id}" ${state.selected.includes(m.id) ? "checked" : ""}>${h(m.id === "popularity" ? "Popularity" : m.id === "content" ? "Nội dung" : m.name.replace(" · ", ": "))}</label>`,
      )
      .join(
        "",
      )}</div><details class="disclosure"><summary>Mở rộng ngoài phạm vi slide</summary><div class="model-options">${b.models
      .filter((x) => !b.default_models.includes(x.id))
      .map(
        (m) =>
          `<label class="model-option"><input type="checkbox" name="model" value="${m.id}" ${state.selected.includes(m.id) ? "checked" : ""}>${h(m.name)}</label>`,
      )
      .join(
        "",
      )}</div><p class="model-choice-note">H3 là phần bổ sung, không phải hướng thứ ba được xác nhận trong slide gốc. H2 blend/H3 hiện chọn nhánh nội dung.</p></details><p class="protocol-note" id="protocol-note">${h(b.protocols[state.protocol])}</p></form><section id="case-output" aria-live="polite">${emptyCase()}</section>`;
  $("#experiment-form").addEventListener("submit", runCase);
  $("#profile-search").addEventListener("input", (e) => {
    state.query = e.target.value;
    clearTimeout(searchTimer);
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
      invalidateCase();
    }),
  );
  loadProfiles();
  if (state.case) renderCase(state.case);
}
function emptyCase() {
  return `<div class="empty"><div class="empty-icon">⌁</div><h3>Sẵn sàng để kiểm chứng</h3><p>Chọn hồ sơ và bấm “Chạy đối chiếu”. Kết quả sai cũng là bằng chứng cần phân tích.</p></div>`;
}
function invalidateCase() {
  state.case = null;
  state.reveal = false;
  const output = $("#case-output");
  if (output) output.innerHTML = emptyCase();
}
async function loadProfiles() {
  const generation = ++state.profileGeneration;
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
            `<option value="${h(p.id)}" ${p.id === state.profile ? "selected" : ""}>${h(p.id)} · ${p.history_length} lịch sử · ${p.target_warm ? "warm" : "cold"}</option>`,
        )
        .join("");
    }
    if (previousProfile !== state.profile) invalidateCase();
    $("#profile-feedback").textContent =
      `Hiện ${data.items.length} / ${data.total} hồ sơ phù hợp. Gõ mã để tìm hồ sơ khác.`;
  } catch (err) {
    if (generation === state.profileGeneration && $("#profile-feedback"))
      $("#profile-feedback").textContent = err.message;
  }
}
async function runCase(event) {
  event.preventDefault();
  if (state.running) return;
  if (!state.profile) {
    toast("Chưa có hồ sơ để đối chiếu.");
    return;
  }
  if (!state.selected.length) {
    toast("Chọn ít nhất một mô hình.");
    return;
  }
  state.running = true;
  $("#run-button").disabled = true;
  $("#case-output").innerHTML = loading(
    "Đang đối chiếu trên cùng tập ứng viên…",
  );
  const protocol = state.protocol,
    profile = state.profile,
    selected = [...state.selected],
    generation = state.generation;
  const started = performance.now();
  try {
    const data = await api("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profile, protocol, models: selected }),
    });
    if (
      state.route !== "experiment" ||
      generation !== state.generation ||
      protocol !== state.protocol ||
      profile !== state.profile ||
      JSON.stringify(selected) !== JSON.stringify(state.selected)
    )
      return;
    data.roundtrip_ms = performance.now() - started;
    state.case = data;
    state.reveal = false;
    renderCase(data);
  } catch (err) {
    if ($("#case-output")) $("#case-output").innerHTML = errorBlock(err);
  } finally {
    state.running = false;
    if ($("#run-button")) $("#run-button").disabled = false;
  }
}
function renderCase(data) {
  const reveal = state.reveal;
  const history = data.history.slice(-12);
  const total = data.history.length;
  $("#case-output").innerHTML =
    `<div class="section-heading"><div><h2>Đối chiếu ${h(data.profile_id)}</h2><p>Cùng ${num(data.candidate_count)} ứng viên · Top 10 · ${data.results.length} mô hình</p></div><button class="btn btn-outline btn-small" data-action="case-csv" ${!reveal ? "disabled" : ""}>Xuất đối chiếu CSV ↓</button></div><div class="case-context"><div class="panel"><div class="history-header"><span class="profile-title">Lịch sử được phép sử dụng</span><span class="tag">${total} tương tác</span></div>${total ? `<div class="history-timeline">${history.map((item, i) => `<div class="history-item"><small>${num(total - history.length + i + 1)} / ${total}</small><p title="${h(item.title)}">${h(item.title)}</p><code>${h(item.item_id)}</code><div><small>Mốc ${num(item.timestamp)}</small></div></div>`).join("")}</div><div class="history-info">${total > 12 ? "Hiển thị 12 tương tác cuối. " : ""}Mọi mốc &lt; ${num(data.cutoff)}. Đơn vị thời gian chưa được xác minh; không diễn giải là ngày.</div>` : `<div class="notice notice-warning">Không có lịch sử có mốc sớm hơn mục tiêu. Mọi mô hình dùng cùng popularity fallback; đây không phải dự đoán cá nhân hóa của GRU/GNN.</div>`}<details class="disclosure"><summary>Xem đầy đủ lịch sử (${total})</summary><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Thứ tự</th><th>Sản phẩm</th><th>Mốc số</th></tr></thead><tbody>${data.history.map((x, i) => `<tr><td>${i + 1}</td><td>${h(x.title)}</td><td>${num(x.timestamp)}</td></tr>`).join("")}</tbody></table></div></details></div><div class="panel target-panel"><span class="target-label">SẢN PHẨM GIỮ LẠI TRONG TEST</span>${reveal ? `<p class="target-name">${h(data.target.title)}</p><code class="target-id">${h(data.target.item_id)}</code><div><span class="tag ${data.target.warm ? "" : "tag-blue"}">${data.target.warm ? "Warm · đã có trong train" : "Cold · chưa có trong train"}</span></div><p class="history-info">Chỉ dùng mục tiêu để tính thứ hạng và chỉ số, không đưa vào lịch sử hay huấn luyện.</p><button class="btn btn-outline btn-small" data-action="reveal">Ẩn mục tiêu</button>` : `<h3 style="margin-top:16px">Đọc top 10 trước.<br>Sau đó mở đáp án.</h3><p class="small muted">Mục tiêu được giữ ngoài lịch sử. Bấm nút để đánh dấu kết quả tìm trúng và xem thứ hạng.</p><button class="btn" data-action="reveal">Mở mục tiêu test →</button>`}</div></div>${reveal ? `<div class="notice ${!data.target.warm ? "notice-warning" : ""}"><strong>Phân tích trường hợp này.</strong> ${data.fallback ? "Hồ sơ không có lịch sử trước mốc, nên mọi mô hình dùng chung popularity fallback. Không quy kết kết quả này là lợi ích của GRU/GNN." : !data.target.warm ? "Mục tiêu chưa xuất hiện trong train. M1/M2/M3 không có đầu ra ID đã học cho item này; thứ hạng giữa các item cold bằng điểm chỉ theo ID, không phải độ phù hợp ngữ nghĩa. H2/nội dung có thể chấm từ tiêu đề, nhưng vẫn cần đối chiếu trúng hoặc sai." : data.history.length <= 2 ? "Mục tiêu đã có trong train nhưng lịch sử rất ngắn. Đây là điều kiện cần kiểm tra riêng; chưa đủ để quy nguyên nhân dự đoán sai cho một thành phần mô hình." : "Mục tiêu đã có trong train và có lịch sử trước test. So M1/M2/M3 để xem tác động trên case này, rồi kiểm tra kết luận trên toàn tập cùng cohort."}</div>` : ""}<div class="run-meta"><span>RUN ${h(data.run_id)} · ${h(data.execution_mode)} · Không huấn luyện lại khi bấm nút</span><span>Xếp hạng phía máy chủ: ${num(data.server_ms, 2)} ms · API + đọc JSON: ${num(data.roundtrip_ms, 1)} ms</span></div><div class="comparison-grid">${data.results.map((result) => `<article class="model-card"><header class="model-card-head"><div><span class="model-family">${h(model(result.model).family)}</span><h3>${h(result.name)}</h3></div><span class="hit-badge ${!reveal || !result.hit10 ? "miss-badge" : ""}">${!reveal ? "Chưa đối chiếu" : result.hit10 ? "Trúng top 10" : "Chưa trúng"}</span></header><ol class="ranking-list">${result.top10.map((item) => `<li class="ranking-item ${reveal && item.is_target ? "target" : ""}"><span class="ranking-pos">${String(item.rank).padStart(2, "0")}</span><div><span class="ranking-title" title="${h(item.title)}">${h(item.title)}</span><small>${h(item.item_id)} ${reveal && item.is_target ? "· MỤC TIÊU TEST" : ""}</small></div></li>`).join("")}</ol><footer class="model-footer"><span>${reveal ? `Mục tiêu: hạng ${num(result.rank)} / ${num(data.candidate_count)}` : "Chờ mở mục tiêu test"}</span><span>${reveal ? `NDCG ${decimal(result.ndcg10)}` : "K = 10"}</span></footer></article>`).join("")}</div><div class="notice"><strong>Cách đọc kết quả.</strong> Một hồ sơ chỉ là trường hợp minh họa. Kết luận mô hình cần dựa trên toàn tập, warm/cold, khoảng tin cậy và nhiều seed. Điểm chuẩn hóa không phải xác suất khách mua hàng.</div><a href="#results" class="btn btn-outline">Xem kết quả toàn tập →</a>`;
}
async function results() {
  const generation = state.generation;
  $("#main").innerHTML =
    heading(
      "02 / ĐÁNH GIÁ TOÀN TẬP",
      "Kết luận bằng toàn bộ dữ liệu.",
      "Cùng người dùng, cùng catalog và ứng viên. Epoch và trọng số đã chọn bằng validation.",
    ) +
    `<div class="result-controls"><div><label for="metrics-protocol">Giao thức</label><select id="metrics-protocol">${protocolOptions(state.protocol)}</select></div><div><label for="metrics-cohort">Nhóm mục tiêu</label><select id="metrics-cohort">${options(
      [
        ["all", "Tất cả người dùng"],
        ["warm", "Warm · mục tiêu đã có trong train"],
        ["cold", "Cold · mục tiêu chưa có trong train"],
      ],
      state.cohort,
    )}</select></div><a href="/api/export/metrics.csv" class="btn btn-outline">Xuất toàn bộ CSV ↓</a><a id="report-link" href="/api/export/report.md?protocol=${state.protocol}&cohort=${state.cohort}" class="btn">Tải nhận xét & kết quả ↓</a></div><div class="study-strip" id="metric-context"></div><div id="metrics-body">${loading()}</div>`;
  const update = async () => {
    const protocol = $("#metrics-protocol").value,
      cohort = $("#metrics-cohort").value;
    state.protocol = protocol;
    state.cohort = cohort;
    $("#metrics-body").innerHTML = loading();
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
      $("#report-link").href =
        `/api/export/report.md?protocol=${protocol}&cohort=${cohort}`;
      const rows = coreRows(data.rows);
      $("#metrics-body").innerHTML =
        `<div class="panel">${metricsTable(rows, true)}<p class="table-caption">CI 95% = bootstrap NDCG theo người dùng, 500 lần. Đây là một seed huấn luyện, chưa gồm biến thiên giữa các lần huấn luyện.</p></div>${metricLegend()}<div class="section-heading"><div><h2>So sánh NDCG@10</h2><p>Chất lượng thứ hạng của mục tiêu. Thanh dài hơn chưa đồng nghĩa có khác biệt thống kê.</p></div></div><div class="panel">${bars(rows)}</div><div class="notice notice-warning"><strong>Lưu ý về phạm vi.</strong> H2 ở đây là LightGCN + TF-IDF/SVD. Chưa chạy MiniLM đúng như slide. H2 blend/H3 chọn trọng số nội dung, chưa có bằng chứng cải thiện do mô hình lai.</div><details class="disclosure"><summary>Phần mở rộng ngoài slide và đối chiếu chênh lệch</summary><div>${metricsTable(
          data.rows.filter(
            (r) => !state.bootstrap.default_models.includes(r.model),
          ),
          true,
        )}${data.contrasts.length ? `<h4 style="margin-top:20px">Chênh lệch NDCG so với baseline nội dung</h4><div class="table-wrap"><table class="metrics-table"><thead><tr><th>Mô hình</th><th>Δ NDCG</th><th>CI 95% theo cặp</th></tr></thead><tbody>${data.contrasts.map((r) => `<tr><td>${h(model(r.model).name)}</td><td class="metric-num">${decimal(r.ndcg_delta)}</td><td class="metric-num">${decimal(r.ci_low)} – ${decimal(r.ci_high)}</td></tr>`).join("")}</tbody></table></div><p class="table-caption">Phân tích khám phá, chưa hiệu chỉnh nhiều phép so sánh; không thay thế đánh giá nhiều seed hoặc thử nghiệm thực tế.</p>` : ""}</div></details><div class="notice">Web dùng giao thức full catalog cho phép mua lại cho mọi mô hình. Một bảng full catalog ở bản demo cũ từng lọc lịch sử; không so trực tiếp hai giao thức này.</div>`;
    } catch (err) {
      if (generation === state.generation)
        $("#metrics-body").innerHTML = errorBlock(err);
    }
  };
  $("#metrics-protocol").addEventListener("change", update);
  $("#metrics-cohort").addEventListener("change", update);
  await update();
}
const discussionData = [
  {
    family: "H1 / M1",
    title: "GRU4Rec — thứ tự tương tác",
    strength:
      "Học thứ tự và phụ thuộc trong chuỗi; là mốc đối chứng để tách tác động của đặc trưng thời gian.",
    limit:
      "Chỉ có đầu ra ID cho sản phẩm train. Chuỗi ngắn và nhiều mục tiêu cold-item khiến việc dự đoán khó; thứ tự không thể thay thế khoảng cách thời gian.",
    next: "Đánh giá riêng warm-item và chuỗi dài; tăng dữ liệu chuỗi sạch, so với baseline đơn giản trước khi tăng kiến trúc.",
  },
  {
    family: "H1 / M2",
    title: "Time Gap — khoảng cách giữa các lần",
    strength:
      "Đưa log(1 + gap/scale) vào GRU để mô hình có thể phân biệt tương tác sát nhau và cách xa nhau.",
    limit:
      "Timestamp đang là số rút gọn chưa rõ đơn vị. Không thể kết luận mô hình đã học hành vi theo ngày; mốc trùng làm mất thông tin thứ tự.",
    next: "Khôi phục timestamp gốc, kiểm tra đơn vị và split thời gian. Chạy ablation M1/M2 cùng seed, cùng ngân sách.",
  },
  {
    family: "H1 / M3",
    title: "Time Decay — ưu tiên tín hiệu gần",
    strength:
      "Trọng số exp(−age/scale) giảm ảnh hưởng đầu vào cũ; giả thuyết phù hợp khi sở thích thay đổi.",
    limit:
      "Chỉ giảm embedding đầu vào, chưa phải decay trạng thái GRU. Scale hiện theo train, chưa tối ưu đầy đủ τ; tín hiệu cũ có ích có thể bị giảm quá mức.",
    next: "Tìm τ trên validation sau khi xác minh thời gian; phân tích nhóm mua lặp, sở thích bền và thay đổi nhanh.",
  },
  {
    family: "H2",
    title: "LightGCN + Text — quan hệ & nội dung",
    strength:
      "Lan truyền quan hệ user–item và chiếu đặc trưng tiêu đề; có thể chấm item chưa có tương tác nếu có nội dung.",
    limit:
      "Đồ thị train rất thưa; user không có cạnh train chưa học được ID embedding. Văn bản hiện chỉ là tiêu đề TF-IDF/SVD; chưa phải MiniLM. Catalog được giả định sẵn trước test, chưa xác minh ngày xuất bản.",
    next: "Bổ sung metadata thật, so TF-IDF với MiniLM; ablation text-only, graph-text và blend. Kiểm tra cold-item theo thời điểm xuất bản thật.",
  },
];
async function discussion() {
  const generation = state.generation;
  $("#main").innerHTML =
    heading(
      "03 / THẢO LUẬN",
      "Điểm mạnh, hạn chế và hướng đi.",
      "Phân biệt khả năng thiết kế với lợi ích đã đo. Không mặc định mô hình phức tạp sẽ tốt hơn.",
    ) +
    `<div id="discussion-evidence">${loading()}</div><div class="two-col">${discussionData.map((x) => `<article class="discussion-card"><span class="model-family">${h(x.family)}</span><h3>${h(x.title)}</h3><div class="discussion-block"><strong>Điểm mạnh về thiết kế</strong><p>${h(x.strength)}</p></div><div class="discussion-block"><strong>Hạn chế cần nói khi bảo vệ</strong><p>${h(x.limit)}</p></div><div class="discussion-block"><strong>Hướng cải tiến có thể kiểm chứng</strong><p>${h(x.next)}</p></div></article>`).join("")}</div><div class="section-heading"><div><h2>Nên ưu tiên đi tiếp theo thứ tự nào?</h2><p>Mỗi bước cần một kiểm chứng, không chỉ thêm tên mô hình.</p></div><span class="section-tag">RESEARCH ROADMAP</span></div><div class="priority-list">${[
      [
        "01",
        "Sửa nền dữ liệu và giao thức",
        "Lấy timestamp gốc, ngày xuất bản catalog và metadata đầy đủ; xác minh train/validation/test theo thời gian toàn hệ thống. Đây là ưu tiên trước tuning.",
      ],
      [
        "02",
        "Hoàn thiện đúng hai hướng trong slide",
        "Giữ M1/M2/M3 cho H1; bổ sung MiniLM cho H2 và so với TF-IDF trên cùng điều kiện. Chỉ ghi MiniLM khi đã chạy và có artifact.",
      ],
      [
        "03",
        "Chứng minh lợi ích bằng ablation và nhiều seed",
        "Đo full catalog + warm/cold, chuỗi ngắn/dài, nhiều seed và CI chênh lệch. Chọn cấu hình bằng validation, giữ test để báo cáo.",
      ],
      [
        "04",
        "Chọn mô hình có bằng chứng rồi mới ứng dụng",
        "Ưu tiên baseline tốt nếu mô hình phức tạp chưa vượt. H3 chỉ là mở rộng khi giảng viên đồng ý; thử nghiệm doanh nghiệp cần A/B và dữ liệu thật riêng.",
      ],
    ]
      .map(
        ([n, t, p]) =>
          `<div class="priority-row"><div class="priority-number">${n}</div><div><h4>${h(t)}</h4><p>${h(p)}</p></div></div>`,
      )
      .join(
        "",
      )}</div><div class="notice"><strong>Cách kết luận phù hợp.</strong> “Trong thiết lập và bộ dữ liệu này, mô hình X đạt chỉ số Y; chưa đủ bằng chứng để khái quát sang dữ liệu khác hoặc hiệu quả kinh doanh.” Báo cáo trường hợp sai và điều kiện mô hình không áp dụng được.</div>`;
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
      `<div class="study-strip"><strong>Bằng chứng của lần chạy ${h(state.bootstrap.run_id)}</strong><span>Đánh giá toàn bộ ${num(state.bootstrap.audit.catalog)} sản phẩm · Không diễn giải như tỷ lệ mua hàng.</span></div><div class="stats"><div class="stat"><div class="stat-label">Content · Recall toàn tập</div><div class="stat-value">${pct(text.recall10)}</div><small>NDCG ${decimal(text.ndcg10)}</small></div><div class="stat"><div class="stat-label">${h(model(bestH1.model).short)} · Recall warm</div><div class="stat-value">${pct(bestH1.recall10)}</div><small>Chỉ ${bestH1.users} mục tiêu đã có trong train</small></div><div class="stat"><div class="stat-label">Content · Recall cold</div><div class="stat-value">${pct(coldText.recall10)}</div><small>${coldText.users} mục tiêu chưa có trong train</small></div><div class="stat"><div class="stat-label">Trọng số graph của H2 blend</div><div class="stat-value">${num(state.bootstrap.audit.h2_graph_weight, 2)}</div><small>Validation chưa chọn lợi ích thêm của graph</small></div></div>`;
  } catch (err) {
    if (generation === state.generation)
      $("#discussion-evidence").innerHTML = errorBlock(err);
  }
}
async function methodology() {
  const b = state.bootstrap,
    a = b.audit,
    generation = state.generation;
  $("#main").innerHTML =
    heading(
      "04 / PHƯƠNG PHÁP",
      "Một quy trình có thể tái lập.",
      "Theo dõi dữ liệu đầu vào, lựa chọn mô hình, giao thức test và artifact của lần chạy.",
    ) +
    `<div class="study-strip"><strong>RUN ${h(b.run_id)}</strong><span>Seed ${a.seed} · CPU / 2 luồng · K = 10</span><span>Sinh artifact: ${h(new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(b.generated_at)))} (giờ Việt Nam)</span></div><div class="method-steps"><article class="method-step"><div><h3>Kiểm tra dữ liệu và loại mốc nhập nhằng</h3><p>Train gốc ${num(a.raw_train_rows)} dòng, giữ ${num(a.train_rows)} dòng có timestamp nhỏ hơn mốc validation tương ứng; bỏ ${a.excluded_ambiguous_train_rows} dòng. Validation ${a.val_rows}, test ${a.test_rows}, catalog ${num(a.catalog)}. ${a.empty_strict_test_profiles} hồ sơ không có lịch sử trước test dùng cùng popularity fallback. Đơn vị timestamp chưa xác minh.</p></div></article><article class="method-step"><div><h3>Học từ train, chọn bằng validation</h3><p>H1: ${num(a.training_prefixes)} tiền tố, embedding 32, GRU hidden 48, tối đa 30 tương tác; Adam 0,003, tối đa 25 epoch, early stopping 5. M2 ghép gap; M3 nhân trọng số đầu vào với scale tương đối ${a.gap_scale}. Không gọi scale này là ngày. Mỗi biến thể có checkpoint riêng.</p></div></article><article class="method-step"><div><h3>Đồ thị và văn bản không dùng cạnh test</h3><p>H2: LightGCN hai tầng với D⁻¹ᐟ² A D⁻¹ᐟ², embedding 32 và BPR trên train. Tiêu đề → TF-IDF bigram → SVD 64 chiều; fit đặc trưng trên item train. Điểm cuối dùng 50% user embedding + 50% trung bình item embedding lịch sử strict-prior. Baseline nội dung cũng có trọng số recency. Không dùng review sau mua làm nội dung sản phẩm. Đây là biến thể TF-IDF, chưa phải MiniLM.</p></div></article><article class="method-step"><div><h3>Đánh giá trên cùng điều kiện</h3><p>Full catalog: toàn bộ ${num(a.catalog)} sản phẩm, cho phép mua lại cho mọi mô hình, không lọc theo nhãn target. Sampled: 1 target + 99 negatives cố định seed 42, loại lịch sử khỏi negatives. Tie-break theo ID sản phẩm. Tách warm/cold, Recall/NDCG/Coverage tại 10 và CI bootstrap 500 lần theo người dùng.</p></div></article><article class="method-step"><div><h3>Xuất điểm và chạy web nhẹ</h3><p>Mạng neural được huấn luyện offline. Web chỉ đọc dòng điểm từ tệp memory-map, xếp hạng và đối chiếu. Giao diện không tải ma trận hoặc mô hình. Thời gian API không đại diện thời gian huấn luyện/suy luận lại neural. Render Free vẫn có thể chậm khi khởi động sau thời gian ngủ.</p></div></article></div><div class="section-heading"><div><h2>Đường học trên validation</h2><p>Đường cong từ log huấn luyện thực tế, không dùng test để chọn epoch.</p></div></div><div id="training-charts">${loading()}</div><div class="section-heading"><div><h2>Tái lập từ dữ liệu gốc</h2><p>Cần bộ dữ liệu local trong data/; gói phục vụ web đã có artifact.</p></div></div><pre class="code-block">python -m venv .venv
.venv/bin/pip install -r requirements-train.txt
.venv/bin/python train.py --epochs 25
.venv/bin/python export_web.py
.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8501</pre><details class="disclosure"><summary>Hash đầu vào và phiên bản điểm mô hình</summary><div><table class="hash-table"><tbody>${Object.entries(
      a.input_sha256,
    )
      .map(([k, v]) => `<tr><td>${h(k)}</td><td>${h(v)}</td></tr>`)
      .join("")}${Object.entries(b.score_sha256)
      .map(([k, v]) => `<tr><td>${h(k)}.npy</td><td>${h(v)}</td></tr>`)
      .join(
        "",
      )}</tbody></table></div></details><div class="notice notice-warning"><strong>Giới hạn thiết kế.</strong> Split hiện theo từng user và graph transductive chưa thay thế split thời gian toàn cục. Catalog giả định sẵn trước target, một seed huấn luyện và thiếu mô tả thật. Cần báo cáo các hạn chế này khi bảo vệ.</div><div class="download-row"><a class="btn" href="/api/export/report.md">Tải báo cáo Markdown ↓</a><a class="btn btn-outline" href="/api/export/metrics.csv">Tải toàn bộ chỉ số CSV ↓</a></div>`;
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
        return `<div class="training-panel"><h4>${h(name.replace("H1 ", "H1 · "))}</h4><svg class="sparkline" viewBox="0 0 220 110" role="img" aria-label="Validation NDCG của ${h(name)}"><path d="M8 15H212M8 55H212M8 95H212" stroke="#e7ede1" stroke-dasharray="3 3" fill="none"/><polyline points="${points}" fill="none" stroke="#6b9670" stroke-width="2"/></svg><small>Epoch 1–${rows.at(-1).epoch} · Best val ${decimal(best)}</small></div>`;
      })
      .join(
        "",
      )}</div><p class="table-caption">Các đồ thị dùng chung thang NDCG từ 0 đến ${decimal(max)}. Chúng mô tả lựa chọn checkpoint, không phải hiệu quả trên test.</p>`;
  } catch (err) {
    if (generation === state.generation)
      $("#training-charts").innerHTML = errorBlock(err);
  }
}
function downloadCase() {
  const data = state.case;
  if (!data || !state.reveal) return;
  const cell = (v) => {
    let x = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(x)) x = "'" + x;
    return `"${x.replace(/"/g, '""')}"`;
  };
  const rows = [
    [
      "run_id",
      "profile",
      "protocol",
      "model",
      "rank",
      "item_id",
      "title",
      "is_test_target",
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
function closeMenu() {
  $("#sidebar").classList.remove("open");
  $("#menu-button").setAttribute("aria-expanded", "false");
}
function render() {
  if (!state.bootstrap) return;
  state.generation++;
  const route = location.hash.slice(1) || "overview";
  state.route = routes[route] ? route : "overview";
  $("#view-title").textContent = routes[state.route];
  $$("[data-nav]").forEach((el) => {
    if (el.dataset.nav === state.route) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  closeMenu();
  window.scrollTo(0, 0);
  ({ overview, experiment, results, discussion, method: methodology })[
    state.route
  ]();
}
$("#menu-button").addEventListener("click", () => {
  const expanded = $("#sidebar").classList.toggle("open");
  $("#menu-button").setAttribute("aria-expanded", String(expanded));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "reveal":
      state.reveal = !state.reveal;
      renderCase(state.case);
      break;
    case "case-csv":
      downloadCase();
      break;
    case "retry":
      render();
      break;
    case "preset":
      state.preset = button.dataset.value;
      state.query = "";
      $("#profile-search").value = "";
      $$(".preset").forEach((x) =>
        x.classList.toggle("active", x.dataset.value === state.preset),
      );
      invalidateCase();
      loadProfiles();
      break;
  }
});
window.addEventListener("hashchange", render);
async function init() {
  try {
    state.bootstrap = await api("/api/bootstrap");
    state.selected = [...state.bootstrap.default_models];
    $("#run-id").textContent = state.bootstrap.run_id;
    render();
  } catch (err) {
    $("#main").innerHTML = errorBlock(err);
    $("#main").addEventListener(
      "click",
      (e) => {
        if (e.target.closest("[data-action=retry]")) init();
      },
      { once: true },
    );
  }
}
init();
