# Kiểm chứng phiên bản nghiệp vụ

## Đã chạy

`python -m unittest discover -s tests -v`: **12 tests qua**.

- Chỉ nhập snapshot tồn kho hợp lệ; snapshot thiếu SKU tắt bán SKU đó; lỗi đầu vào không đổi DB.
- Click/cart chỉ được ghi cho visitor và request đã có exposure đúng SKU; sự kiện trùng được khử trùng.
- Checkout ghi đơn, accepted price và giảm tồn kho trong một transaction; gửi lại cùng khóa không tạo đơn/trừ hàng hai lần.
- Đơn có một món thiếu hàng bị rollback toàn bộ, bao gồm event purchase; hai checkout đồng thời tranh món cuối chỉ một đơn thành công.
- Gợi ý loại hàng hết, nhóm không phù hợp, lịch sử và món trong giỏ; control/treatment dùng cùng luật bán hàng.
- Phân nhóm A/B ổn định theo visitor và có cả hai nhánh.
- Streamlit AppTest: thêm giỏ → tạo đơn → đối chiếu chỉ số Điều hành; mở Kiểm chứng và đổi giao thức; quay lại chọn hồ sơ và nhu cầu.
- Mật khẩu vận hành tùy chọn chặn dữ liệu Điều hành khi chưa nhập/nhập sai và mở đúng khi nhập hợp lệ. Đây chưa phải phân quyền đầy đủ.
- Các kiểm thử nghiên cứu vẫn tính lại Recall/NDCG từ serving artifact và xác minh ranh giới train đã lọc.

Playwright với Chromium thực tế: cửa hàng → chi tiết → giỏ → tạo đơn thử → dashboard → đối chiếu đơn → nhập snapshot CSV → kiểm chứng; chụp màn hình desktop và mobile. DB kiểm tra trình duyệt riêng, không đưa vào repository. Screenshot dashboard chứa đơn thử thực sự tạo trong lượt kiểm tra, không phải số kinh doanh điền sẵn.

## Chưa được chứng minh

Chưa thử trên deployment Render của người dùng, chưa nối ERP/POS/CRM/payment, chưa load-test hoặc kiểm thử phân quyền đầy đủ. Chưa đo tăng trưởng kinh doanh. Giá/tồn kho mặc định là minh họa. SQLite không giải quyết lưu trữ bền vững trên Render Free. Kết quả offline của mô hình không thay đổi trong lần sửa giao diện/nghiệp vụ này.
