# Triển khai DAD · RecLab trên Render

Runtime đã chuyển sang **FastAPI + HTML/CSS/JavaScript**, không dùng Streamlit hoặc WebSocket Streamlit.

## Render mới

Mở [Deploy to Render](https://render.com/deploy?repo=https://github.com/VanDuy266/TTTN). Đăng nhập và cấp quyền repository nếu được yêu cầu. Blueprint `render.yaml` dùng gói Free:

- Repository: `VanDuy266/TTTN`, nhánh `main`.
- Python: `3.12.12`.
- Build: `pip install -r requirements.txt`.
- Start: `uvicorn app:app --host 0.0.0.0 --port $PORT`.
- Health: `/healthz`.

Giữ tên resource `beauty-intelligence-demo` để phù hợp blueprint trước; tên hiển thị của sản phẩm là DAD · RecLab. Không chọn gói trả phí nếu chưa được chủ tài khoản đồng ý.

## Dịch vụ Render đã có từ bản Streamlit

Nếu dịch vụ được tạo thủ công, đổi Build/Start/Health như trên trong Settings, rồi deploy commit mới nhất. Nếu dùng Blueprint, đồng bộ cấu hình đã cập nhật; đẩy mã GitHub không tự bảo đảm settings thủ công đã đổi. Không giữ start command `streamlit run app.py` vì `app.py` hiện là ASGI app.

Khi trạng thái Live, kiểm tra:

1. `/healthz` trả status ok và đúng run_id.
2. Tổng quan có nhãn Nhóm DAD; chọn Chạy đối chiếu, hồ sơ, chạy sáu model, mở mục tiêu test.
3. Đổi full catalog/100 ứng viên và warm/cold; tải CSV/báo cáo.
4. Mở Hạn chế & hướng đi và đồ thị validation ở Quy trình & tái lập.

Chỉ ghi nhận URL công khai khi đã kiểm tra trên chính deployment. Mã nguồn đã push hoặc chạy local không đồng nghĩa Render đã Live.

## Tốc độ và cold start

Frontend không tải ma trận score hay neural model. Backend memory-map các tệp NPY, chỉ đọc hàng điểm cần dùng. Gzip và cache asset có version hash được bật; dữ liệu theo màn hình tải khi cần. Runtime chỉ cài ba dependency trực tiếp, không cài Streamlit/PyArrow/PyTorch để phục vụ web.

Render Free có thể ngủ khi không hoạt động. Lượt đầu sau khi ngủ có thể chậm do cold start, dù các thao tác sau nhanh. Đổi frontend không xóa giới hạn hosting này. Chưa thực hiện load test hoặc đo latency Internet/Render thực tế; số trong `web-performance.json` chỉ là loopback.

## Máy chủ khác

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8501
```

Phục vụ sau reverse proxy TLS nếu public. Ứng dụng hiện read-only trên artifact nghiên cứu đã ẩn danh, không có upload hay thông tin khách thật, không cần model API key. Chưa có endpoint huấn luyện, API sửa dữ liệu, thông tin thanh toán hoặc admin vận hành.

Việc tạo dịch vụ trong tài khoản Render cần quyền tài khoản/Render API key hợp lệ. Không đưa credential vào repository hay chat. Không có URL Render được xác nhận chỉ từ cấu hình này.
