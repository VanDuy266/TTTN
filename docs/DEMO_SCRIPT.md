# Kịch bản trình bày sản phẩm: 5–7 phút

## 1. Mở bằng bài toán (30 giây)

“Đây là kịch bản website mỹ phẩm. Sản phẩm không chỉ đưa ra điểm mô hình: nó nối nhu cầu khách với danh sách còn bán, giỏ, đơn thử và số liệu vận hành. Tên cửa hàng, giá và tồn kho mặc định là minh họa.”

## 2. Khách mới (1 phút)

Mở **Cửa hàng trải nghiệm**. Chọn nhu cầu Chăm sóc da rồi một sản phẩm quan tâm. Giải thích fallback khi chưa có lịch sử và gợi ý nội dung khi đã chọn nhu cầu. Mở Chi tiết để thấy tên đầy đủ, mã và tồn kho. Ảnh là minh họa nhóm, không mạo nhận ảnh SKU.

## 3. Từ gợi ý sang nghiệp vụ (1 phút)

Thêm một sản phẩm vào giỏ. Danh sách tiếp theo loại món trong giỏ. Chọn Tạo đơn thử nghiệm; không thanh toán. Ghi lại mã DEMO. Giải thích kiểm tra tồn kho/giá ở thời điểm xác nhận, transaction và khóa chống tạo đơn lặp.

## 4. Người vận hành kiểm tra (1–2 phút)

Mở Điều hành → Đối chiếu đơn, chọn mã DEMO vừa tạo. Kiểm tra dòng hàng và giá. Sang Danh mục & tồn kho, tìm mã và đối chiếu đã trừ hàng. Dashboard lấy số từ sự kiện vừa thao tác, không có biểu đồ doanh thu điền sẵn. Xuất log và chỉ ra request_id nối impression/click/cart/purchase.

Có thể tải snapshot, sửa một SKU thành stock=0, nhập lại snapshot và trở về cửa hàng: SKU hết hàng không được đề xuất. Snapshot chỉ có một phần danh mục sẽ tắt bán các mã còn lại; luôn giữ bản xuất để khôi phục khi trình diễn.

## 5. H1/H2/H3 và bằng chứng (1 phút)

Mở Kiểm chứng & tích hợp. H1 nắm chuỗi thời gian, H2 quan hệ và nội dung, H3 kiểm tra kết hợp. Lớp nghiệp vụ áp luật bán hàng sau điểm mô hình. Nói đúng kết quả: validation chọn content, hybrid chưa tốt hơn. Recall full catalog chỉ khoảng 3,56%, không lấy kết quả 100 ứng viên để mô tả toàn bộ catalog.

## 6. Chốt đề xuất doanh nghiệp (30 giây)

Đề xuất nối catalog/kho và event website trước, chạy shadow rồi A/B. Trước vận hành thật cần DB bền vững, API, phân quyền, timestamp chuẩn và tiêu chí nghiệm thu được doanh nghiệp chốt. Chưa có bằng chứng tăng doanh số. Nếu được hỏi “đã dùng cho công ty nào?”, trả lời đây là nguyên mẫu thí điểm, chưa có đối tác được xác nhận trong tài liệu hiện có.
