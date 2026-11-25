# DAD — Web thực nghiệm hệ thống gợi ý

**Nhóm DAD: Duy · Ân · Đạt.** Web phục vụ thực nghiệm thực tập tốt nghiệp theo slide Amazon All Beauty: H1 có M1/M2/M3; H2 dùng đồ thị kết hợp văn bản. H3 là hướng tích hợp được nhóm bổ sung và đã được đưa lên giao diện chính; slide gốc có H1/H2.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/VanDuy266/TTTN)

## Chạy web

Python 3.12. FastAPI và Uvicorn phục vụ web. NumPy, pandas và SciPy xử lý điểm mô hình và dữ liệu của cửa hàng mô phỏng.

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8501
```

Artifact đã có sẵn trong `artifacts/web/`; không cần huấn luyện, PyTorch, API key hoặc tải model qua mạng để mở web. Frontend HTML/CSS/JavaScript được phục vụ từ cùng server với API, không cần Node/npm hoặc build frontend.

## Luồng thực nghiệm

1. **Tổng quan:** câu hỏi nghiên cứu, quy mô train/validation/test, phạm vi hai hướng.
2. **Chạy đối chiếu:** chọn hồ sơ, giao thức full catalog hoặc 100 ứng viên; xem lịch sử trước mục tiêu; xem ngay thứ hạng của sản phẩm thực tế, trạng thái tìm trúng và NDCG@10 của từng mô hình. Chọn tên mô hình để mở danh sách gợi ý tương ứng; có thể xuất CSV.
3. **Kết quả toàn tập:** tách warm/cold, Recall@10/NDCG@10/Coverage@10, CI bootstrap; sắp xếp theo tỷ lệ tìm trúng, điểm thứ hạng hoặc độ phủ và xuất báo cáo Markdown hoặc bảng CSV.
4. **Hạn chế & hướng đi:** điểm mạnh về thiết kế, hạn chế và bằng chứng thực đo; ưu tiên sửa dữ liệu, chạy đúng MiniLM, nhiều seed/ablation trước khi ứng dụng.
5. **Quy trình & tái lập:** cấu hình học, log validation, hash đầu vào, checkpoint và giao thức đánh giá.

Web **xếp hạng từ điểm đã lưu sau huấn luyện**, không huấn luyện hoặc suy luận lại mạng neural khi bấm nút. Chỉ hỗ trợ hồ sơ trong tập thực nghiệm cố định; không phải công cụ dự đoán cho khách hàng mới ngoài tập.

## Mô hình và giới hạn

- M1: GRU4Rec. M2: ghép Time Gap tương đối. M3: Time Decay trên embedding đầu vào. Mỗi biến thể được chạy và lưu checkpoint riêng.
- H2: LightGCN hai tầng, chuẩn hóa bậc nút, BPR; tiêu đề TF-IDF bigram → SVD 64D → phép chiếu học được. **Chưa phải MiniLM trong slide.**
- H2 blend và H3 ngoài phạm vi cốt lõi: validation hiện chọn nhánh nội dung. Không có bằng chứng hybrid tốt hơn.
- Toàn bộ danh mục: cho phép mua lại cho mọi mô hình; không loại item theo nhãn test. 100 ứng viên: một target + 99 negatives cố định, negatives không nằm trong lịch sử.
- Timestamp chưa xác minh đơn vị; chỉ dùng lịch sử nhỏ hơn cutoff. Catalog giả định có sẵn trước target, split theo từng user và graph transductive. Một seed huấn luyện, chưa kiểm định khả năng tổng quát hóa.

Kết quả hiện hành cho web nằm trong **`artifacts/web/metrics.csv`**, run ID trong manifest. Các bảng cũ tại `artifacts/metrics.csv` có giao thức full catalog lọc lịch sử khác; không so trực tiếp.

## Tái lập huấn luyện và artifact

Dữ liệu gốc `data/` được gitignore: cần `train.csv`, `val.csv`, `test.csv`, `item_metadata.csv`, `catalog.csv` (item_id,title,main_category). File catalog ghép `parent_asin` từ metadata đầy đủ vào item_id, giữ mã duy nhất. Hash đầu vào đã công bố trong manifest. Không dùng review sau mua làm mô tả sản phẩm; mô tả `[List]` không được giả làm văn bản đầy đủ.

```bash
.venv/bin/python -m pip install -r requirements-train.txt
.venv/bin/python train.py --epochs 25
.venv/bin/python export_web.py
```

Train ghi đè artifact sinh tự động, nên giữ phiên bản cần bảo toàn trước khi chạy. Không nạp checkpoint PT/pickle được tải lên chưa xác minh. Checkpoint trong repository do mã nguồn này huấn luyện lại.

## Kiểm tra

```bash
.venv/bin/python -m pip install -r requirements-test.txt
.venv/bin/python -m unittest discover -s tests -v
python scripts/benchmark_web.py --python .venv/bin/python
```

Xem [kiểm chứng](docs/VALIDATION.md), [kết quả](docs/RESULTS.md), [nhận xét và hướng đi](docs/DISCUSSION.md), [kịch bản bảo vệ](docs/DEMO_SCRIPT.md), [triển khai Render](docs/DEPLOY.md).

API docs: `/api/docs`. Health check: `/healthz`. Web runtime đọc score bằng memory-map; không tải ma trận lớn xuống browser. Đo loopback trong môi trường sạch: API đối chiếu sáu model p95 khoảng **3,1 ms**; đây không phải SLA hosting hay latency neural inference. [Chi tiết phép đo](docs/web-performance.json).

## Cửa hàng mô phỏng tích hợp

Trong menu web chính, mở **Cửa hàng mô phỏng**. Chọn hồ sơ hoặc sản phẩm quan tâm, xem gợi ý còn hàng, mở chi tiết hoặc thêm vào giỏ, rồi tạo đơn thử. Phần **Vận hành và đối chiếu** hiển thị đơn, tồn kho còn lại và phễu hành vi. Có thể xuất tồn kho/nhật ký, nhập snapshot CSV và bật phân nhóm A/B cho lượt gợi ý tiếp theo.

Giá và tồn kho mẫu, lượt nhấp và đơn thử chỉ dùng để trình diễn. Mỗi cookie trình duyệt có SQLite tạm riêng. Phiên hết hạn sau 4 giờ, toàn bộ dữ liệu thử mất khi máy chủ khởi động lại. Luồng này chưa kết nối ERP/POS, thanh toán, dữ liệu khách hàng hoặc hệ thống doanh nghiệp.

## Bản cũ

`retail_demo.py` là giao diện Streamlit cũ để tham khảo. Web chính dùng lại nghiệp vụ trong `src/business.py` qua API cửa hàng. Muốn chạy riêng cần `requirements-legacy.txt`. Dữ liệu runtime SQLite và upload không được đưa lên GitHub. Kịch bản doanh nghiệp trong `docs/PILOT.md` là tham khảo ứng dụng về sau, không phải mục tiêu của demo thực nghiệm hiện tại.

Giao diện dùng chữ serif cho tiêu đề, chữ sans-serif hệ thống cho phần thao tác và logo DAD cho điều hướng. H3 có trong nhóm mô hình mặc định khi đối chiếu và bảng kết quả chính; trọng số/kết quả thực nghiệm giữ nguyên.

Giao diện dùng tên chức năng tiếng Việt: So sánh dự đoán, Đánh giá mô hình, Nhận xét và cải tiến, Dữ liệu và phương pháp. Bảng kết quả hiển thị số người tìm trúng trên tổng số người dùng, tỷ lệ tìm trúng, điểm thứ hạng và độ phủ; khoảng tin cậy nằm trong phần chi tiết. Tên thuật toán chuẩn và tên sản phẩm trong dữ liệu gốc được giữ nguyên.

Nhận diện hiện tại sử dụng logo DAD ánh kim bạc nền trong suốt trên thanh điều hướng xanh đậm (`web/static/dad-logo-transparent.png`), thanh điều hướng xanh đậm và điểm nhấn vàng. Các chức năng và nhãn đánh giá sử dụng tiếng Việt.

## Cấu trúc chức năng và mô hình

Mục Dữ liệu và mô hình trình bày vai trò tập huấn luyện/xác thực/kiểm tra, số người dùng/sản phẩm/tương tác và đầu vào–xử lý–đầu ra–phạm vi của H1/H2/H3. API `/api/study` lấy mô tả từ `src/study.py` và thống kê tổng hợp `artifacts/web/study_data.json`; không đọc review gốc khi phục vụ web. Thống kê được tạo bởi `scripts/build_study_data.py`, gọi sau khi xuất artifact.

So sánh dự đoán có nhóm riêng H1 (đối chứng phổ biến + M1/M2/M3), H2 (nội dung + đồ thị/nội dung + cấu hình kết hợp), H3 (nội dung + biến thể H1 chọn trên xác thực + nhánh H2 kết hợp + H3). Danh sách mô hình có thể tùy chọn. Sản phẩm ngoài bộ đầu ra đã học của GRU và trường hợp dùng phương án dự phòng được ghi rõ trong kết quả. Không thay đổi điểm dự đoán hoặc huấn luyện lại mô hình trong lần chỉnh chức năng này.
