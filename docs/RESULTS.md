# Kết quả thực nghiệm đã chạy

Seed 42, CPU 2 luồng; thời gian huấn luyện/đánh giá 52.5 giây.

Train gốc 2712 dòng; bỏ 296 dòng có mốc >= validation tương ứng; dùng 2416 dòng. Catalog 2934 sản phẩm, 646 hồ sơ; cold test 550/646 sau lọc. Tất cả 646 user vẫn được đánh giá, hồ sơ rỗng dùng popularity.

## 100 ứng viên cố định

| Model | Users | Recall@10 | NDCG@10 | Coverage@10 |
|---|---:|---:|---:|---:|
| Popularity | 646 | 0.047988 | 0.025562 | 0.162236 |
| Content TF-IDF | 646 | 0.255418 | 0.146683 | 0.845603 |
| Graph branch | 646 | 0.102167 | 0.044188 | 0.726653 |
| H1 GRU | 646 | 0.027864 | 0.015541 | 0.331970 |
| H2 Graph + Text | 646 | 0.255418 | 0.146683 | 0.845603 |
| H3 Hybrid | 646 | 0.255418 | 0.146683 | 0.845603 |

## Toàn danh mục

| Model | Users | Recall@10 | NDCG@10 | Coverage@10 |
|---|---:|---:|---:|---:|
| Popularity | 646 | 0.003096 | 0.001995 | 0.006135 |
| Content TF-IDF | 646 | 0.035604 | 0.016816 | 0.775051 |
| Graph branch | 646 | 0.000000 | 0.000000 | 0.245058 |
| H1 GRU | 646 | 0.000000 | 0.000000 | 0.135310 |
| H2 Graph + Text | 646 | 0.035604 | 0.016816 | 0.775051 |
| H3 Hybrid | 646 | 0.035604 | 0.016816 | 0.775051 |

## Kết luận đúng phạm vi

H1 chọn GRU `gap`. Trọng số graph của H2 = 0.0. H3 = {'h1': 0.0, 'h2': 1.0, 'popularity': 0.0}.

Validation chọn nhánh nội dung; H2 và H3 trùng baseline content. Không có bằng chứng GRU hoặc graph cải thiện kết quả trong thiết lập hiện tại. Không được báo cáo đây là tăng trưởng của hybrid.

Chi tiết warm/cold, khoảng tin cậy NDCG bootstrap người dùng, thử trọng số và lịch sử huấn luyện nằm trong artifacts. Chưa có nhiều seed, kiểm định chênh lệch nhiều mô hình hay A/B kinh doanh. Danh mục giả định có sẵn trước target; timestamp chưa xác minh đơn vị. Các hạn chế này chưa cho phép kết luận sẵn sàng production.

Kết quả web có bộ lọc đã xem/tồn kho và MMR nên có thể khác offline (mặc định không MMR, cho phép dự đoán mua lại target đã từng mua). Tốc độ xếp lại trong giao diện chỉ đo thao tác trên điểm đã tính sẵn, không phải latency suy luận mô hình mới.