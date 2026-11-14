# DAD · RecLab — Web thực nghiệm hệ thống gợi ý

**Nhóm DAD: Duy · Ân · Đạt.** Web phục vụ thực nghiệm thực tập tốt nghiệp theo slide Amazon All Beauty: H1 có M1/M2/M3; H2 dùng đồ thị kết hợp văn bản. H3 là phần mở rộng, không phải hướng thứ ba được xác nhận trong slide.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/VanDuy266/TTTN)

## Chạy web

Python 3.12; runtime chỉ cần FastAPI, Uvicorn và NumPy, **không dùng Streamlit**:

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8501
```

Artifact đã có sẵn trong `artifacts/web/`; không cần huấn luyện, PyTorch, API key hoặc tải model qua mạng để mở web. Frontend HTML/CSS/JavaScript được phục vụ từ cùng server với API, không cần Node/npm hoặc build frontend.

## Luồng thực nghiệm

1. **Tổng quan:** câu hỏi nghiên cứu, quy mô train/validation/test, phạm vi hai hướng.
2. **Chạy đối chiếu:** chọn hồ sơ, giao thức full catalog hoặc 100 ứng viên; xem lịch sử trước mục tiêu; so top 10 của M1, M2, M3, H2 và các baseline. Mở mục tiêu test để kiểm tra trúng, thứ hạng và NDCG; xuất CSV.
3. **Kết quả toàn tập:** tách warm/cold, Recall@10/NDCG@10/Coverage@10, CI bootstrap; xuất báo cáo Markdown và bảng CSV.
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

## Bản cũ

`retail_demo.py` và `src/business.py` giữ nguyên mẫu bán hàng cũ để tham khảo, không được gọi bởi web hiện tại hoặc Render. Muốn chạy riêng cần `requirements-legacy.txt`. Dữ liệu runtime SQLite và upload không được đưa lên GitHub. Kịch bản doanh nghiệp trong `docs/PILOT.md` là tham khảo ứng dụng về sau, không phải mục tiêu của demo thực nghiệm hiện tại.
