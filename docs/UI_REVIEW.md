# Rà soát giao diện thực nghiệm

- Mở trang vào chức năng so sánh; mặc định nhóm H1.
- Chọn H1/H2/H3 hoặc tất cả bằng nút riêng; bộ lọc và tùy chọn mô hình nằm trong mục mở rộng.
- Hiện trực tiếp sản phẩm thực tế, trạng thái tìm trúng, thứ hạng và NDCG.
- Mỗi mô hình hiện 5 sản phẩm đầu; mở rộng để xem hạng 6–10. Xuất CSV gồm đủ kết quả.
- Lịch sử, thông tin kỹ thuật, giải nghĩa chỉ số và định nghĩa mô hình được thu gọn.
- Giữ Times New Roman, logo DAD trong suốt và màu xanh đậm.

## Kiểm chứng

`python -m unittest discover -s tests -q`: 21 bài, 20 đạt, 1 bỏ qua.
`python scripts/browser_smoke.py`: kiểm tra H1/H2/H3/tất cả, CSV, thay đổi hồ sơ, các trang nghiên cứu và điện thoại 390px; không có lỗi JavaScript.

## Phạm vi kết quả

Không huấn luyện lại hoặc sửa chỉ số. Toàn danh mục: mô hình nội dung và H3 tìm trúng 22/646 (3,41%). H3 hiện trùng mô hình nội dung; chưa chứng minh cải thiện tích hợp. Demo đối chiếu điểm dự đoán đã lưu, chưa có kiểm chứng hiệu quả doanh nghiệp thực tế.
