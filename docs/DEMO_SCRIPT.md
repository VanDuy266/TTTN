# Kịch bản trình bày thực nghiệm — Nhóm DAD (5–7 phút)

## 1. Phạm vi nghiên cứu (30 giây)

“Nhóm DAD nghiên cứu hệ thống gợi ý sản phẩm Amazon All Beauty. H1 so ba biến thể GRU theo thời gian, H2 nghiên cứu đồ thị kết hợp nội dung. Đây là demo kiểm chứng mô hình offline, chưa phải hệ thống bán hàng thực tế.”

Mở Tổng quan, chỉ ra 646 hồ sơ, 2.934 sản phẩm, 2.416 tương tác train sau lọc. Phần lớn target cold-item làm bài toán khó.

## 2. Lịch sử và điều kiện chung (1 phút)

Mở Chạy đối chiếu. Chọn hồ sơ bất kỳ (không chỉ chọn case đẹp). Chọn toàn danh mục; xem lịch sử có timestamp nhỏ hơn cutoff. Không diễn giải mốc số thành ngày vì đơn vị chưa xác minh. M1/M2/M3/H2 và baseline được đánh giá trên cùng hồ sơ, cùng ứng viên.

## 3. Dự đoán và đáp án giữ lại (1–2 phút)

Bấm Chạy đối chiếu. Web đọc điểm đã lưu và xếp hạng, không huấn luyện hay suy luận lại neural khi bấm nút. Xem top 10 trước, rồi bấm Mở mục tiêu test để xác định mô hình tìm trúng hay không và target ở hạng bao nhiêu. Xuất CSV nếu cần.

Dùng các preset warm/cold hoặc lịch sử dài để phân tích điều kiện; không dùng một case đẹp để kết luận tổng quát. Với lịch sử rỗng, nói rõ mọi model dùng chung fallback, chưa phải thành công của cá nhân hóa.

## 4. Kết quả toàn tập (1 phút)

Mở Kết quả toàn tập, xem full catalog trước rồi đổi 100 ứng viên. Tách warm/cold và đọc số user. Giải thích Recall là hit một target, NDCG thưởng vị trí, Coverage là độ phủ danh mục. Không lấy số 100 ứng viên để diễn giải toàn catalog.

Kết quả neural hiện thấp; H2 blend/H3 chọn content. Trình bày trung thực, không gọi hybrid tốt hơn. Báo cáo Markdown/CSV chứa run_id, giao thức và giới hạn.

## 5. Hạn chế và hướng đi (1 phút)

Mở Hạn chế & hướng đi, phân biệt điểm mạnh về thiết kế với kết quả đã đo. Thứ tự ưu tiên: timestamp/catalog sạch → MiniLM đúng H2 trong slide và baseline TF-IDF → ablation/nhiều seed/split thời gian → ứng dụng sau khi có bằng chứng. H3 chỉ mở rộng nếu giảng viên đồng ý.

## 6. Khả năng tái lập (30 giây)

Mở Quy trình & tái lập: log validation, seed, hash dữ liệu, checkpoint, lệnh train/export. Nói rõ H2 đang dùng TF-IDF/SVD, chưa phải MiniLM. Web độc lập Streamlit; tốc độ server đo local không phải tốc độ neural inference hay SLA Render.
