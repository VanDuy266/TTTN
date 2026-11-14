# Đề xuất thí điểm doanh nghiệp

Phù hợp cửa hàng mỹ phẩm/thương mại điện tử có catalog và lịch sử sự kiện. Chưa có tên doanh nghiệp, đề cương yêu cầu chi tiết hoặc quyền kết nối hệ thống trong tài liệu hiện tại.

## Luồng tích hợp đề xuất

1. Đồng bộ catalog: `item_id`, tên, mô tả, danh mục, giá, tồn kho, trạng thái bán và thời điểm xuất bản.
2. Thu sự kiện có sự đồng ý/phạm vi sử dụng phù hợp: mã khách ẩn danh, timestamp UTC, event_id, item_id, event_type (`view`, `cart`, `purchase`). Không cần email, số điện thoại hay tên thật để huấn luyện.
3. Dịch vụ gợi ý nhận mã khách + thời điểm + ngữ cảnh, lấy lịch sử trước thời điểm yêu cầu, gọi phiên bản mô hình đã duyệt, lọc hàng hết/không bán, trả top K. Khách mới dùng nội dung hoặc popularity.
4. Ghi impression kèm request_id, vị trí, version và nhóm A/B; nối click/cart/purchase bằng cùng request_id. Demo hiện chỉ ghi nút quan tâm trong phiên, chưa triển khai dịch vụ này.

## Kế hoạch nghiệm thu

- **Kiểm tra offline:** split theo thời gian, cùng cohort và catalog cho mọi model; Recall/NDCG/coverage; warm/cold; kiểm tra rò rỉ và dữ liệu trễ.
- **Chạy shadow:** kiểm tra chất lượng tồn kho, thời gian phản hồi p50/p95, tỷ lệ lỗi và fallback, chưa tác động khách hàng.
- **A/B:** ngẫu nhiên theo khách, nhóm cố định; đối chứng popularity. Chốt KPI chính, MDE, power/cỡ mẫu và thời gian trước khi chạy. Không suy ra cỡ mẫu khi chưa có baseline traffic/conversion.
- **KPI:** CTR = click/impression, conversion = phiên mua/phiên đủ điều kiện, doanh thu trên phiên; guardrails gồm hoàn trả, tỷ lệ đề xuất hàng hết, tỷ lệ lỗi, latency và độ phủ.
- **Quyết định:** chỉ triển khai rộng khi KPI chính đạt tiêu chí thống kê/thực tiễn đã thống nhất, guardrail đạt và có cơ chế rollback.

Ngưỡng SLA và mục tiêu kinh doanh cần doanh nghiệp xác nhận theo hệ thống thực, không được ghi thành kết quả đã đạt. Cần phân quyền, kiểm soát truy cập API, lưu sự kiện bền vững, giám sát drift, phiên bản model/dataset và lịch tái huấn luyện trước production.
