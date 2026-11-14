# Triển khai Streamlit

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
