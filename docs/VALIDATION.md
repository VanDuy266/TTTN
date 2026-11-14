# Kiểm chứng DAD · RecLab — Web độc lập Streamlit

## Kết quả kiểm tra

`python -m unittest discover -s tests -v`: **19 tests qua**. Gồm 8 kiểm thử web/API mới, 4 kiểm thử nghiên cứu và 7 kiểm thử nghiệp vụ legacy được giữ để tránh mất hành vi cũ. Runtime web không import Streamlit hoặc module bán hàng.

Web/API đã kiểm tra:

- Trang HTML, health và metadata gọn; root không chứa bootstrap của Streamlit.
- Bộ lọc warm/cold/lịch sử rỗng, query không có kết quả và giới hạn tham số.
- Cùng 2.934 hoặc 100 ứng viên cho mọi model; K = 10; lịch sử strictly trước cutoff.
- Từ chối profile/model/giao thức không hợp lệ, model trùng hoặc danh sách rỗng.
- Hồ sơ rỗng dùng cùng popularity fallback cho mọi mô hình.
- Tính lại Recall, NDCG và Coverage từ điểm cho **toàn bộ 48 hàng kết quả**: 8 mô hình × 2 giao thức × 3 cohort.
- Thứ hạng một case khớp quy tắc tie-break theo ID; không ưu tiên target khi bằng điểm.
- CSV, báo cáo Markdown, log huấn luyện đủ M1/M2/M3/H2 và API docs.

Playwright/Chromium đã chạy luồng trình duyệt: Tổng quan → Chạy đối chiếu bảy model, gồm H3 → mở mục tiêu → đổi preset warm → Kết quả cold/100 ứng viên → Hạn chế & hướng đi → log validation. Mobile 390 px chạy được cùng luồng, không tràn ngang. Không có lỗi JavaScript trong lượt kiểm tra. Các screenshot `research-web-*.png` ghi lại giao diện mới.

## Hiệu năng

Tạo virtualenv sạch `/workspace/reclab-web-venv`, cài đúng `requirements.txt` (không kế thừa site-packages), khởi động Uvicorn và gọi HTTP thực trên loopback. 30 lượt sau warm-up, mỗi lượt sáu model/full catalog, nhiều profile khác nhau.

Xem `docs/web-performance.json` và `scripts/benchmark_web.py`: startup tới health khoảng 409 ms, API p50 2,59 ms, p95 3,10 ms. Bootstrap gzip 2.216 byte; case gzip trung bình 4.559 byte. Đây là phép đo local của lần kiểm tra, **không phải SLA Render/Internet, latency neural inference hay bằng chứng nhanh hơn một tỷ lệ cố định so với bản cũ**.

Backend memory-map điểm NPY theo hàng, frontend chỉ tải metadata/top 10, gzip và asset cache có hash. Không nạp similarity matrix vào serving path, không tải model xuống browser, không huấn luyện lại khi thao tác.

## Phạm vi chưa xác nhận

Chưa kiểm tra trên deployment Render của người dùng, chưa load-test hay đo cold start Render Free. Một seed huấn luyện, timestamp chưa rõ đơn vị, metadata chưa có ngày xuất bản, H2 chưa chạy MiniLM. Không có bằng chứng hiệu quả kinh doanh. Bảng full catalog mới cho phép mua lại, không trộn với bảng legacy có lọc lịch sử.

Bản chỉnh nhận diện DAD: đã kiểm tra lại 19 tests và luồng trình duyệt với 7 mô hình mặc định, H3 hiện trực tiếp ở tổng quan/đối chiếu/kết quả/nhận xét; chữ Times New Roman và icon SVG, không dùng logo RecLab cũ. Không thay đổi điểm hay kết quả mô hình.
