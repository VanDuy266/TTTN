# Điểm mạnh, hạn chế và hướng nghiên cứu — DAD

## Phân biệt lợi thế thiết kế và bằng chứng

| Hướng | Điểm mạnh về thiết kế | Hạn chế hiện tại | Kiểm chứng cần làm tiếp |
|---|---|---|---|
| M1 GRU4Rec | Học thứ tự chuỗi; mốc đối chứng cho thời gian | Chỉ dự đoán ID đã học; nhiều chuỗi ngắn/cold target | Tách warm/cold, chuỗi dài/ngắn và baseline phổ biến |
| M2 Time Gap | Thêm khoảng cách giữa các tương tác | Timestamp chưa rõ đơn vị, nhiều mốc trùng | Khôi phục thời gian gốc, cùng seed/ngân sách với M1 |
| M3 Time Decay | Giảm ảnh hưởng embedding đầu vào cũ | Chưa phải decay trạng thái GRU; scale cố định tương đối, có thể bỏ tín hiệu cũ hữu ích | Tìm τ trên validation, phân tích mua lặp và sở thích ổn định/thay đổi |
| H2 LightGCN + Text | Kết hợp quan hệ và nội dung, có thể chấm cold-item có metadata | Đồ thị thưa; user không có cạnh train thiếu ID embedding đã học; title-only TF-IDF/SVD; chưa chạy MiniLM trong slide | Bổ sung metadata, so TF-IDF/MiniLM và text-only/graph-text; kiểm tra ngày xuất bản |
| H2 blend/H3 bổ sung | Cho phép phối hợp các tín hiệu | Validation chọn content; chưa có lợi ích hybrid | Chỉ mở rộng khi baseline bị vượt qua có bằng chứng; H3 cần giảng viên chấp thuận |

## Các giới hạn chung

1. Train từ split có sẵn, bỏ mốc >= validation của cùng user; lịch sử phục vụ strictly trước test. Chưa có timestamp gốc để dựng split toàn cục theo thời gian. Graph transductive có thể dùng các cạnh của user khác ở mốc muộn hơn test của một user; không gọi đây là kiểm chứng hệ thống online theo thời gian.
2. Catalog metadata giả định có sẵn trước mục tiêu; không có ngày phát hành sản phẩm để xác minh. “Cold” là chưa có trong train tương tác, chưa chứng minh cold-start thực tế hoàn toàn.
3. Mô tả/features bị rút thành `[List]`; chỉ dùng tiêu đề. Không dùng review sau mua để giả làm metadata có sẵn trước mua.
4. Một seed, ngân sách nhỏ, dữ liệu thưa. Bootstrap người dùng không bao trùm biến thiên huấn luyện; CI chênh lệch chưa hiệu chỉnh nhiều phép so sánh.
5. 100 ứng viên và toàn catalog là hai bài toán khác nhau. Web hiện cho phép mua lại trong full catalog cho mọi model; không trộn với bảng legacy có lọc lịch sử.
6. Web đọc score checkpoint lưu sẵn, không neural inference online, không hỗ trợ hồ sơ ngoài tập 646 user và chưa đo lợi ích kinh doanh.

## Ưu tiên tiếp theo

**P0 — Dữ liệu:** timestamp gốc + đơn vị, ngày xuất bản catalog, metadata thật, kiểm tra ID và split thời gian toàn cục.

**P1 — Đúng đề tài:** M1/M2/M3 cùng ngân sách, H2 MiniLM so với TF-IDF. Công bố đúng encoder và siêu tham số thực chạy, không thay tên để khớp slide.

**P2 — Bằng chứng:** ablation text-only/graph-text/temporal, nhiều seed, warm/cold, chuỗi dài/ngắn, full catalog, CI chênh lệch. Chọn cấu hình trên validation, test giữ để báo cáo.

**P3 — Ứng dụng:** chỉ chọn mô hình phức tạp khi có lợi ích so baseline. Doanh nghiệp cần thử nghiệm riêng với traffic, KPI, A/B và quyền dữ liệu; không suy ra tăng doanh thu từ Recall/NDCG offline.

Baseline nội dung đã có trọng số recency theo lịch sử. H2 graph-text cuối dùng 50% user embedding học được và 50% trung bình item embedding lịch sử strict-prior trước khi chấm item. Đây là cấu hình cố định của lần chạy, chưa tối ưu đầy đủ; không quy mọi chênh lệch giữa H1/H2 cho riêng cấu trúc graph.
