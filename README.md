# Beauty Intelligence — Nhóm 2

Demo Streamlit cho đề tài Amazon All Beauty, nối mô hình tuần tự H1, đồ thị/nội dung H2 và hướng tích hợp H3. Báo cáo được cung cấp chỉ có H1 và H2; H3 là phần bổ sung trong sản phẩm này.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/VanDuy266/TTTN)

Render đọc cấu hình `render.yaml`, chạy gói Free và dùng cổng do nền tảng cấp. Cần đăng nhập tài khoản Render để tạo dịch vụ; chỉ có URL công khai sau khi deploy thành công.

## Chạy web

Python 3.12:

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

Các artifact phục vụ đã kèm sẵn; mở web không cần PyTorch, API key, notebook, dữ liệu review gốc hay huấn luyện lại. Người dùng thử chọn hồ sơ hoặc khách mới, xem top K, áp tồn kho, xuất CSV và đối chiếu mục tiêu test. Phản hồi chỉ lưu trong phiên; không có đơn hàng hay doanh thu thật.

## Ba hướng và bằng chứng

- **H1:** GRU4Rec, time gap, time decay; học tiền tố chuỗi, chọn biến thể/epoch trên validation.
- **H2:** LightGCN hai tầng với chuẩn hóa bậc nút, BPR, phép chiếu vector tiêu đề; kết hợp điểm nội dung theo validation.
- **H3:** tổng trọng số điểm percentile H1/H2/popularity, chọn trên validation. Trọng số bằng 0 là kết quả hợp lệ và được công bố.

Bộ mã hóa đang chạy là **TF-IDF bigram + SVD 64 chiều**, không phải MiniLM/LLM. Không nạp các checkpoint `.pt` được tải lên vì chưa xác minh kiến trúc, ID và nguồn gốc. Checkpoint trong `artifacts` do mã nguồn này huấn luyện lại.

Xem [kiểm tra học thuật](docs/REVIEW.md), [kết quả chạy](docs/RESULTS.md), [thí điểm doanh nghiệp](docs/PILOT.md) và [triển khai](docs/DEPLOY.md).

## Tái lập huấn luyện

Dữ liệu nguyên bản và notebook không được đưa vào gói triển khai. Đặt `train.csv`, `val.csv`, `test.csv`, `item_metadata.csv` vào `data/`. Tạo `data/catalog.csv` gồm `item_id,title,main_category`, ghép `parent_asin` từ metadata đầy đủ vào `item_id`, giữ ID duy nhất. Chỉ dùng tiêu đề sản phẩm; không dùng tiêu đề/nội dung review làm đặc trưng sản phẩm. Hash của đầu vào lần chạy này nằm trong `artifacts/audit.json`.

```bash
.venv/bin/python -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python train.py --epochs 25
.venv/bin/python -m unittest discover -s tests -v
```

Tài nguyên lần chạy: CPU, 2 luồng PyTorch, seed 42. Ngân sách này phục vụ nguyên mẫu; chưa tìm kiếm rộng siêu tham số hay chạy nhiều seed. Mỗi lần huấn luyện ghi đè artifact sinh tự động; nên sao lưu phiên bản cần giữ trước khi chạy lại.

## Giới hạn cần biết

Đánh giá 100 ứng viên có thể cao hơn đáng kể so với toàn danh mục. Cả hai đều được báo cáo. Warm/cold được tính theo tập train thật sự dùng sau khi bỏ mốc thời gian nhập nhằng. Danh mục được giả định có sẵn trước mục tiêu; chưa có ngày công bố sản phẩm để xác minh. Split theo từng người dùng và graph train dạng transductive chưa thay thế kiểm định theo mốc thời gian toàn hệ thống.

Đây là nguyên mẫu offline đã có kiểm thử, chưa có xác thực người dùng, cơ sở dữ liệu sự kiện bền vững, API thương mại hay kiểm chứng tăng doanh số.
