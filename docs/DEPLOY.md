# Triển khai Streamlit

## Render — cấu hình đã chuẩn bị

Mở [Deploy to Render](https://render.com/deploy?repo=https://github.com/VanDuy266/TTTN), đăng nhập và cho phép Render đọc repository khi được yêu cầu. Blueprint `render.yaml` tạo web service `beauty-intelligence-demo` trên gói Free, cài `requirements.txt`, chạy Streamlit bằng biến `$PORT` và kiểm tra `/_stcore/health`. Chọn nhánh `main` nếu Render yêu cầu.

Chọn tạo Blueprint/Deploy trong tài khoản của bạn. Khi Render báo Live, mở URL HTTPS được Render cấp và kiểm tra luồng khách cũ, khách mới, bảng metrics và xuất CSV. Dịch vụ Free có thể ngủ khi không hoạt động, nên lần truy cập đầu có thể chậm. Không chọn gói trả phí nếu chưa có chủ tài khoản đồng ý chi phí.

Không cần API key cho mô hình và không cần cài PyTorch để phục vụ web. Hiện chưa có deployment ID hoặc URL Render đã được xác nhận; mã nguồn và blueprint không đồng nghĩa dịch vụ đã Live.

## Streamlit Community Cloud

Gói demo chỉ cần `app.py`, `src/`, `.streamlit/config.toml`, `requirements.txt` và `artifacts/`. Không cần upload notebook, raw review, PDF hoặc khóa API.

1. Đưa source cùng serving artifact lên repository GitHub do bạn quản lý.
2. Đăng nhập Streamlit Community Cloud bằng tài khoản được cấp quyền repository.
3. Chọn repository `VanDuy266/TTTN`, nhánh chứa bản demo, entrypoint `app.py`, Python 3.12 rồi Deploy.
4. Chờ build, kiểm tra tab gợi ý cho khách đã có lịch sử và khách mới; kiểm tra bảng metrics và xuất CSV. Chỉ chia sẻ URL sau khi các luồng này hoạt động trên instance được triển khai.

Quá trình đăng nhập/ủy quyền tài khoản hosting cần chủ tài khoản thực hiện. Thành công khi chạy trong máy phát triển không đồng nghĩa đã xuất bản web công khai. Không có URL công khai được xác nhận trong lần bàn giao này nếu chưa hoàn thành các bước trên.

## Máy chủ nội bộ

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

Đặt phía sau reverse proxy có TLS và xác thực của doanh nghiệp. Demo chưa có cơ chế đăng nhập hoặc phân quyền riêng. Không đưa hệ thống có dữ liệu khách thật ra Internet trước khi tích hợp bảo vệ truy cập.

Kiểm tra vận hành bằng `GET /_stcore/health`, sau đó kiểm tra chức năng; health endpoint riêng lẻ không chứng minh luồng gợi ý đã chạy.
