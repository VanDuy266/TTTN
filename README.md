# Beauty Intelligence — Nhóm 2

Nguyên mẫu thí điểm website mỹ phẩm: trải nghiệm khách mua hàng, điều hành cửa hàng và kiểm chứng nghiên cứu trong ba không gian riêng. H1 (chuỗi/thời gian), H2 (đồ thị/nội dung) và H3 (tích hợp) nối qua lớp luật bán hàng và sự kiện có truy vết. Báo cáo gốc chỉ có H1 và H2; H3 là đề xuất bổ sung.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/VanDuy266/TTTN)

Render đọc cấu hình `render.yaml`, chạy gói Free và dùng cổng do nền tảng cấp. Cần đăng nhập tài khoản Render để tạo dịch vụ; chỉ có URL công khai sau khi deploy thành công.

## Chạy web

Python 3.12:

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

Các artifact phục vụ đã kèm sẵn; mở web không cần PyTorch, API key, notebook, dữ liệu review gốc hay huấn luyện lại.

- **Cửa hàng trải nghiệm:** chọn nhu cầu/lịch sử, xem hàng còn bán, xem chi tiết, thêm giỏ và tạo đơn thử.
- **Điều hành cửa hàng:** CSV snapshot tồn kho/giá, phễu sự kiện, phân nhóm A/B tùy chọn, đối chiếu đơn và xuất log.
- **Kiểm chứng & tích hợp:** sơ đồ H1/H2/H3 gắn với nghiệp vụ, kết quả full catalog và ranh giới triển khai thật.

Đơn mô phỏng và tồn kho được lưu bằng SQLite trong `runtime/retail.sqlite`; có kiểm tra giao dịch nguyên tử và chống checkout lặp. Đặt `RETAIL_DB_PATH` nếu cần đổi đường dẫn. **Render Free có thể mất DB khi restart/redeploy**; chưa dùng cho dữ liệu thật. Giá/tồn kho mặc định sinh để minh họa; dashboard không có KPI kinh doanh điền sẵn.

Đặt `RETAIL_ADMIN_PASSWORD` để bảo vệ màn hình vận hành bằng mật khẩu tùy chọn. Nếu không đặt, màn hình mở cho trình diễn; chưa có SSO/RBAC. [Kịch bản trình bày 5–7 phút](docs/DEMO_SCRIPT.md) giải thích một hành trình hoàn chỉnh.

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

Đây là nguyên mẫu có luồng nghiệp vụ và log SQLite trên một instance, chưa có xác thực khách hàng, phân quyền đầy đủ, DB bền vững trên hosting, API thương mại hay kiểm chứng tăng doanh số.
