"""Factual experiment descriptions shared by the UI and research API."""
def evaluation_method():
    return {
        'workflow': [
            {'title': 'Huấn luyện', 'description': 'Học tham số từ tập huấn luyện. Đồ thị H2 chỉ chứa cạnh từ tập này.'},
            {'title': 'Chọn cấu hình', 'description': 'Chọn checkpoint, biến thể H1 và trọng số kết hợp theo NDCG@10 trên 100 ứng viên cố định của tập xác thực.'},
            {'title': 'Kiểm tra', 'description': 'Mỗi hồ sơ có một sản phẩm mục tiêu. Lịch sử chỉ gồm tương tác có mốc nhỏ hơn mốc kiểm tra.'},
            {'title': 'Vận hành trên web', 'description': 'Đọc điểm có sẵn cho hồ sơ kiểm tra và xếp giảm dần. Khi bằng điểm, ưu tiên mã sản phẩm theo thứ tự từ điển. Hồ sơ trống dùng độ phổ biến từ tập huấn luyện cho mọi mô hình.'},
        ],
        'protocols': [
            {'title': 'Toàn bộ danh mục', 'description': 'Mọi sản phẩm trong danh mục là ứng viên, kể cả sản phẩm đã xuất hiện trong lịch sử. Giao thức này mô phỏng trường hợp có thể mua lại.'},
            {'title': '100 ứng viên cố định', 'description': 'Mỗi hồ sơ có sản phẩm mục tiêu và 99 sản phẩm lấy mẫu không hoàn lại, loại các sản phẩm trong lịch sử khỏi nhóm lấy mẫu. Các mô hình dùng cùng tập ứng viên của hồ sơ.'},
        ],
        'metrics': [
            {'title': 'Tỷ lệ tìm trúng · Recall@10', 'description': 'Số hồ sơ có sản phẩm mục tiêu trong 10 gợi ý đầu chia cho tổng số hồ sơ của nhóm đang xem.'},
            {'title': 'Điểm thứ hạng · NDCG@10', 'description': 'Với một mục tiêu mỗi hồ sơ, điểm bằng 1 / log₂(r + 1) nếu mục tiêu ở hạng r từ 1 đến 10, và bằng 0 nếu nằm ngoài Top 10. Bảng hiển thị trung bình theo hồ sơ.'},
            {'title': 'Độ phủ danh mục · Coverage@10', 'description': 'Số sản phẩm khác nhau xuất hiện trong Top 10 của các hồ sơ đang xem chia cho kích thước toàn bộ danh mục. Mẫu số vẫn là toàn bộ danh mục khi đánh giá trên 100 ứng viên mỗi hồ sơ.'},
        ],
        'bootstrap': 'Khoảng tin cậy 95% của NDCG@10 dùng 500 lần lấy mẫu lại theo hồ sơ, seed 42. Khoảng này phản ánh biến thiên giữa hồ sơ trong một lần huấn luyện.',
    }


def model_study(manifest, data):
    audit=manifest['audit'];weights=audit['h3_weights']
    selected={'base':'m1','gap':'m2','decay':'m3'}[audit['gru_selected']]
    collapse=(weights['h1']==0 and weights['h2']==1 and weights['popularity']==0 and audit['h2_graph_weight']==0)
    return {
        'run_id':manifest['run_id'],
        'data':data,
        'evaluation':evaluation_method(),
        'execution':{'mode':'saved_scores','label':'Điểm dự đoán đã lưu',
                     'description':'Các mô hình được huấn luyện trước. Web đọc điểm của người dùng đã có trong tập kiểm tra, xếp hạng và đối chiếu với sản phẩm thực tế.'},
        'functions':[
            {'name':'Dữ liệu và mô hình','purpose':'Thống kê các tập dữ liệu; xác định đầu vào, cách xử lý, đầu ra và phạm vi của từng hướng.'},
            {'name':'So sánh dự đoán','purpose':'Tạo danh sách 10 sản phẩm từ điểm đã lưu và đối chiếu với sản phẩm thực tế của một người dùng.'},
            {'name':'Đánh giá mô hình','purpose':'Tổng hợp số người tìm trúng, tỷ lệ tìm trúng, điểm thứ hạng và độ phủ trên toàn tập kiểm tra.'},
            {'name':'Nhận xét và cải tiến','purpose':'Phân tích ưu điểm, hạn chế và kết quả của từng hướng nghiên cứu.'}
        ],
        'directions':[
            {'id':'h1','name':'Hướng 1 — Tuần tự và thời gian','models':['m1','m2','m3'],
             'input':'Chuỗi mã sản phẩm và mốc thời gian tương tác trước thời điểm kiểm tra.',
             'processing':'M1 học thứ tự bằng GRU4Rec. M2 ghép đặc trưng log(1 + Δt/s) vào đầu vào GRU. M3 nhân véc-tơ đầu vào với exp(−a/s), trong đó a là khoảng cách đến tương tác gần nhất trong chuỗi và s là hệ số chuẩn hóa dùng chung.',
             'output':'Điểm dự đoán cho từng sản phẩm thuộc tập huấn luyện; từ đó xếp hạng 10 kết quả đầu.',
             'scope':'M1/M2/M3 chỉ có đầu ra đã học cho sản phẩm xuất hiện trong tập huấn luyện. Sản phẩm mới ngoài bộ mã không có điểm dự đoán đã học.',
             'status':'Đã huấn luyện và đánh giá riêng M1, M2, M3.',
             'parameters':{'Số chiều véc-tơ đầu vào':32,'Số chiều trạng thái GRU':48,'Độ dài chuỗi tối đa':30,'Số vòng huấn luyện tối đa':25,'Tốc độ học':0.003,'Hệ số chuẩn hóa thời gian tương đối':audit['gap_scale']},
             'experiment_models':['popularity','m1','m2','m3']},
            {'id':'h2','name':'Hướng 2 — Đồ thị và nội dung','models':['h2'],
             'input':'Quan hệ người dùng–sản phẩm từ tập huấn luyện và tiêu đề sản phẩm.',
             'processing':'LightGCN lan truyền trên đồ thị hai tầng. Tiêu đề được mã hóa bằng TF-IDF và giảm chiều bằng SVD; mô hình học điểm tương tác bằng hàm mất mát BPR. Véc-tơ dùng để chấm điểm kết hợp 50% phần người dùng đã học và 50% trung bình véc-tơ sản phẩm trong lịch sử.',
             'output':'Điểm tương tác người dùng–sản phẩm; có thể chấm sản phẩm chưa có tương tác nếu có thông tin tiêu đề.',
             'scope':'Chỉ dùng danh mục đã chuẩn bị. Ngày công bố sản phẩm chưa được xác minh; phần văn bản chưa triển khai MiniLM như đề xuất trong tài liệu.',
             'status':'Đã đánh giá phiên bản LightGCN + TF-IDF/SVD. Cấu hình phụ H2 kết hợp trộn điểm đồ thị với điểm nội dung.',
             'parameters':{'Số tầng đồ thị':2,'Số chiều véc-tơ đồ thị':32,'Số chiều văn bản sau SVD':64,'Tốc độ học':0.01,'Trọng số véc-tơ người dùng đã học':0.5,'Trọng số véc-tơ lịch sử':0.5},
             'experiment_models':['content','h2','h2_tuned']},
            {'id':'h3','name':'Hướng 3 — Tích hợp H1–H2','models':['h3'],
             'input':'Điểm của biến thể H1 được chọn trên tập xác thực, nhánh H2 kết hợp và mô hình độ phổ biến.',
             'processing':'Chuyển điểm mỗi nhánh về thang thứ hạng từ 0 đến 1 theo từng hồ sơ, rồi tính tổng có trọng số. Trọng số được chọn trên tập xác thực; H3 không phải một mạng được huấn luyện độc lập.',
             'output':'Một bảng điểm kết hợp và danh sách 10 sản phẩm được xếp hạng cao nhất.',
             'scope':'Đây là hướng tích hợp được bổ sung cho nguyên mẫu. Kết quả phụ thuộc chất lượng các mô hình thành phần.',
             'status':('Đã đánh giá phép kết hợp. Cấu hình hiện tại trùng mô hình nội dung; chưa có cải thiện nhờ phối hợp nhiều nhánh.' if collapse else 'Đã đánh giá phép kết hợp; trọng số bên dưới được chọn trên tập xác thực. Kết quả so sánh nằm trong bảng đánh giá.'),
             'collapses_to_content':collapse,
             'parameters':{'Trọng số H1':weights['h1'],'Trọng số H2 kết hợp':weights['h2'],'Trọng số độ phổ biến':weights['popularity'],'Trọng số đồ thị trong nhánh H2':audit['h2_graph_weight']},
             'selected_h1':selected,
             'formula':f"Điểm H3 = {weights['h1']:g} × điểm H1 + {weights['h2']:g} × điểm H2 kết hợp + {weights['popularity']:g} × điểm độ phổ biến.",
             'experiment_models':['content',selected,'h2_tuned','h3']}
        ],
        'groups':[
            {'id':'all','label':'Tất cả hướng','models':manifest['default_models']},
            {'id':'h1','label':'Hướng 1: so sánh M1/M2/M3','models':['popularity','m1','m2','m3']},
            {'id':'h2','label':'Hướng 2: đồ thị và nội dung','models':['content','h2','h2_tuned']},
            {'id':'h3','label':'Hướng 3: kiểm tra phép tích hợp','models':['content',selected,'h2_tuned','h3']}
        ]
    }
