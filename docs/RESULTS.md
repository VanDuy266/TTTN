# Kết quả hiện hành — DAD · RecLab

Run ID: `a7a85e27f1a1`. Seed 42, CPU 2 luồng. Điểm được sinh bằng `train.py` và `export_web.py`.

**Giao thức web mới:** full catalog cho phép mua lại với mọi model, không lọc theo target. Bảng này thay thế phần diễn giải web; số liệu legacy trong artifacts/metrics.csv có giao thức lọc lịch sử khác, không so trực tiếp.

## Toàn danh mục — cho phép mua lại

| Model | Users | Recall@10 | NDCG@10 | Coverage@10 |
|---|---:|---:|---:|---:|
| Popularity | 646 | 0.003096 | 0.001995 | 0.003408 |
| TF-IDF + SVD | 646 | 0.034056 | 0.013824 | 0.801977 |
| M1 · GRU4Rec | 646 | 0.000000 | 0.000000 | 0.255283 |
| M2 · GRU + Time Gap | 646 | 0.000000 | 0.000000 | 0.135310 |
| M3 · GRU + Time Decay | 646 | 0.000000 | 0.000000 | 0.312883 |
| H2 · LightGCN + Text | 646 | 0.000000 | 0.000000 | 0.309816 |
| H2 · Blend chọn bằng validation | 646 | 0.034056 | 0.013824 | 0.801977 |
| H3 · Hybrid (bổ sung) | 646 | 0.034056 | 0.013824 | 0.801977 |

## 100 ứng viên cố định

| Model | Users | Recall@10 | NDCG@10 | Coverage@10 |
|---|---:|---:|---:|---:|
| Popularity | 646 | 0.047988 | 0.025562 | 0.162236 |
| TF-IDF + SVD | 646 | 0.255418 | 0.146683 | 0.845603 |
| M1 · GRU4Rec | 646 | 0.041796 | 0.018384 | 0.387526 |
| M2 · GRU + Time Gap | 646 | 0.027864 | 0.015541 | 0.331970 |
| M3 · GRU + Time Decay | 646 | 0.043344 | 0.017772 | 0.402863 |
| H2 · LightGCN + Text | 646 | 0.102167 | 0.044188 | 0.726653 |
| H2 · Blend chọn bằng validation | 646 | 0.255418 | 0.146683 | 0.845603 |
| H3 · Hybrid (bổ sung) | 646 | 0.255418 | 0.146683 | 0.845603 |

## Nhận xét

Trên full catalog, M1/M2/M3 và H2 graph-text chưa tìm trúng target trong top 10 ở lần chạy này. Baseline nội dung tốt hơn theo ước lượng điểm; H2 blend/H3 chọn nội dung nên không có bằng chứng lợi ích tăng thêm của hybrid.

Các baseline/mô hình vẫn có khả năng đưa ra top 10; việc render danh sách không chứng minh danh sách đó đúng. Phải đối chiếu target và toàn tập.

H2 dùng TF-IDF/SVD, chưa phải MiniLM. Timestamp chưa rõ đơn vị, catalog giả định có sẵn, một seed và split theo user/transductive. Xem DISCUSSION.md để biết thứ tự cải tiến. Không suy ra tăng doanh thu từ các chỉ số này.