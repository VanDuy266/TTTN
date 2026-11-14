from pathlib import Path
import html, io, json, time
import numpy as np
import pandas as pd
import streamlit as st
from src.ranking import topk, diversify, scale

ROOT=Path(__file__).resolve().parent
st.set_page_config(page_title='Beauty Intelligence · Nhóm 2',page_icon='✦',layout='wide')

@st.cache_resource
def load():
    p=ROOT/'artifacts'
    catalog=pd.read_csv(p/'catalog.csv',dtype={'item_id':str})
    arrays=dict(np.load(p/'serving.npz',allow_pickle=False))
    return catalog,arrays,json.loads((p/'profiles.json').read_text()),pd.read_csv(p/'metrics.csv'),json.loads((p/'audit.json').read_text())

if not (ROOT/'artifacts/serving.npz').exists():
    st.error('Chưa có mô hình. Chạy python train.py trước khi mở demo.');st.stop()
cat,arrays,profiles,metrics,audit=load()
ids=cat.item_id.to_numpy();titles=cat.title.fillna('Chưa có tên').to_numpy()
st.markdown('''<style>
.block-container {padding-top:4rem;max-width:1440px}
h1 {font-size:3.2rem!important;letter-spacing:-.055em;line-height:1.05!important}
h2,h3 {letter-spacing:-.025em}
.eyebrow {color:#b8f36c;font-size:.8rem;letter-spacing:.18em;font-weight:700}
.intro {color:#a2b2c2;font-size:1.05rem;max-width:800px}
.product {border:1px solid #2c3947;border-radius:16px;padding:18px;min-height:205px;background:linear-gradient(135deg,#182532,#101923)}
.product h4 {font-size:1rem;line-height:1.45;min-height:65px;margin:10px 0}
.badge {color:#b8f36c;font-size:.75rem;letter-spacing:.06em}
.muted {color:#9eacba;font-size:.8rem}
</style>''',unsafe_allow_html=True)
with st.sidebar:
    st.markdown('## ✦ Beauty Intelligence')
    st.caption('NHÓM 2 / AMAZON ALL BEAUTY')
    st.divider()
    st.markdown('**Một hệ thống · Ba hướng nghiên cứu**')
    st.write('H1 · Sở thích theo chuỗi')
    st.write('H2 · Đồ thị và nội dung')
    st.write('H3 · Kết hợp để xếp hạng')
    st.divider()
    st.info('Bản thử nghiệm trên dữ liệu Amazon. Hiệu quả kinh doanh cần được đo tại doanh nghiệp.')
    st.caption('Không cần API key. Không thu thập thông tin khách hàng thật trong demo.')

st.markdown('<div class="eyebrow">RECOMMENDATION LAB / 2026</div>',unsafe_allow_html=True)
st.markdown('<h1>Hiểu sở thích.<br>Gợi ý có căn cứ.</h1>',unsafe_allow_html=True)
st.markdown('<p class="intro">Từ lịch sử mua sắm đến danh sách sản phẩm phù hợp. Trải nghiệm ba hướng nghiên cứu trong cùng một sản phẩm, với kết quả đánh giá có thể kiểm tra.</p>',unsafe_allow_html=True)
c1,c2,c3,c4=st.columns(4)
c1.metric('Hồ sơ thử nghiệm',f"{audit['users']:,}")
c2.metric('Sản phẩm trong danh mục',f"{audit['catalog']:,}")
c3.metric('Tương tác huấn luyện',f"{audit['train_rows']:,}")
c4.metric('Mục tiêu mới / tập test',f"{audit['cold_test_targets']/audit['test_rows']:.1%}")
tabs=st.tabs(['Khám phá gợi ý','Kiểm chứng mô hình','Liên kết ba hướng','Thí điểm doanh nghiệp'])
with tabs[0]:
    left,right=st.columns([1,2])
    with left:
        st.subheader('Chọn một hành trình')
        customer=st.radio('Tình huống',['Khách đã có lịch sử','Khách mới'],horizontal=True)
        model=st.selectbox('Mô hình',['H3 · Hybrid','H2 · Graph + Text','H1 · GRU','Nội dung','Phổ biến'])
        key={'H3 · Hybrid':'h3','H2 · Graph + Text':'h2','H1 · GRU':'h1','Nội dung':'content','Phổ biến':'popularity'}[model]
        k=st.slider('Số sản phẩm',3,20,10)
        diversity=st.slider('Ưu tiên đa dạng nội dung',0.,.5,.15,.05)
        excluded=set()
        if customer=='Khách đã có lịch sử':
            profile=st.selectbox('Hồ sơ ẩn danh',[p['profile'] for p in profiles])
            u=next(j for j,p in enumerate(profiles) if p['profile']==profile)
            history=profiles[u]['history'];excluded={ids[j] for j in history}
            scores=arrays[key][u].copy()
            st.caption(f'{len(history)} tương tác trước thời điểm test. Danh sách gợi ý không sử dụng mục tiêu test.')
            with st.expander('Xem lịch sử trước mục tiêu'):
                st.dataframe(cat.iloc[history][['item_id','title']],hide_index=True)
            if not history:st.warning('Không có lịch sử có timestamp sớm hơn mục tiêu; ưu tiên phổ biến khi phục vụ.')
            if not history:scores=arrays['popularity'][u].copy()
        else:
            seeds=st.multiselect('Chọn sản phẩm bạn quan tâm',range(len(cat)),format_func=lambda j:str(titles[j])[:100],max_selections=5)
            history=list(seeds);excluded={ids[j] for j in seeds}
            scores=scale(arrays['similarity'][seeds].mean(0)) if seeds else arrays['popularity'][0].copy()
            st.caption('Khách mới dùng nội dung từ sản phẩm đã chọn; chưa có lựa chọn sẽ dùng mức phổ biến. Không gọi đây là dự đoán GRU cho người dùng mới.')
        with st.expander('Điều kiện bán hàng'):
            stockfile=st.file_uploader('CSV tồn kho: item_id, available (0 hoặc 1)',type='csv')
            if stockfile is not None:
                try:
                    stock=pd.read_csv(stockfile,dtype={'item_id':str})
                    if not {'item_id','available'}.issubset(stock):raise ValueError('Thiếu cột item_id hoặc available')
                    available=pd.to_numeric(stock.available,errors='raise')
                    if not available.isin([0,1]).all() or stock.item_id.duplicated().any():raise ValueError('available phải là 0/1 và mỗi item_id chỉ xuất hiện một lần')
                    allowed=set(stock.loc[available==1,'item_id'])
                    excluded.update(set(ids)-allowed)
                    st.success(f'{len(set(ids)&allowed)} sản phẩm có thể đề xuất')
                except Exception as exc:
                    st.error(f'Không thể dùng tệp tồn kho: {exc}');st.stop()
        started=time.perf_counter()
        ranked=diversify(scores,arrays['similarity'],ids,k,diversity,excluded)
        latency=(time.perf_counter()-started)*1000
        rec=cat.iloc[ranked][['item_id','title']].copy();rec.insert(0,'rank',range(1,len(rec)+1))
        rec['model']=model if customer=='Khách đã có lịch sử' else ('Content onboarding' if history else 'Popularity fallback')
        st.download_button('↓ Xuất danh sách gợi ý',rec.to_csv(index=False).encode('utf-8-sig'),'recommendations.csv','text/csv')
    with right:
        st.subheader('Dành cho hành trình này')
        st.caption(f'{len(ranked)} đề xuất · Đã lọc lịch sử và tồn kho · Xếp lại trong {latency:.1f} ms (không gồm tải mô hình/giao diện)')
        if not ranked:st.info('Không còn sản phẩm thỏa điều kiện. Hãy kiểm tra danh sách tồn kho.')
        for start in range(0,len(ranked),2):
            cols=st.columns(2)
            for col,j in zip(cols,ranked[start:start+2]):
                with col:
                    if history:
                        near=max(history,key=lambda x:arrays['similarity'][j,x])
                        sim=float(arrays['similarity'][j,near])
                        reason=('Có nội dung gần với '+str(titles[near])[:65]) if sim>.01 else 'Được xếp hạng theo mô hình đã chọn'
                    else:reason='Mức phổ biến từ tập huấn luyện'
                    badge='ĐÃ CÓ TƯƠNG TÁC' if bool(cat.iloc[j].in_train) else 'CHƯA CÓ TƯƠNG TÁC TRAIN'
                    st.markdown(f'<div class="product"><span class="badge">{badge}</span><h4>{html.escape(str(titles[j]))}</h4><p class="muted">{html.escape(reason)}</p><span class="muted">{html.escape(str(ids[j]))}</span></div>',unsafe_allow_html=True)
                    if st.button('Quan tâm sản phẩm',key=f'click_{j}'):
                        st.session_state.setdefault('events',[]).append({'item_id':str(ids[j]),'event':'interest','model':model,'session_index':len(st.session_state.get('events',[]))+1})
                        st.toast('Đã ghi nhận trong phiên demo')
        st.caption('Lý do tương đồng nội dung chỉ giải thích thuộc tính gần nhau, không phải giải thích nhân quả cho toàn bộ điểm mô hình.')
with tabs[1]:
    st.subheader('Kết quả tính lại từ dữ liệu đính kèm')
    st.write('Tất cả mô hình dùng chung tập người dùng, ứng viên và chỉ số. Chọn mô hình, epoch và trọng số bằng validation; test dùng để báo cáo.')
    if audit['h2_graph_weight']==0 and audit['h3_weights']['h1']==0:
        st.info('Kết quả lựa chọn: validation ưu tiên hoàn toàn nhánh nội dung. H2/H3 hiện cho cùng kết quả với content; chưa có bằng chứng GRU hoặc đồ thị giúp cải thiện trên bộ dữ liệu này.')
    protocol=st.radio('Không gian đánh giá',['100 ứng viên cố định','Toàn bộ danh mục'],horizontal=True)
    cohort=st.selectbox('Nhóm mục tiêu',['all','warm','cold'],format_func=lambda s:{'all':'Tất cả','warm':'Sản phẩm có trong train','cold':'Sản phẩm chưa có trong train'}[s],disabled=protocol=='Toàn bộ danh mục')
    split='test' if protocol=='100 ứng viên cố định' else 'test_full_catalog'
    shown=metrics[(metrics.split==split)&(metrics.cohort==(cohort if split=='test' else 'all'))]
    st.dataframe(shown[['model','users','Recall@10','NDCG@10','Coverage@10','NDCG_CI_low','NDCG_CI_high']],hide_index=True,width='stretch')
    st.bar_chart(shown.set_index('model')[['Recall@10','NDCG@10']])
    st.caption('Recall: tìm trúng mục tiêu trong top 10. NDCG: ưu tiên mục tiêu ở thứ hạng cao. Coverage: tỷ lệ danh mục xuất hiện trong top 10. CI: bootstrap 95% theo người dùng, 500 lần, chưa gồm biến thiên giữa các seed huấn luyện.')
    st.warning('Danh mục metadata được giả định có sẵn trước mục tiêu; chưa có ngày công bố sản phẩm để xác minh. Đây là cold-item theo tương tác, chưa phải chứng minh vận hành với sản phẩm mới thực tế.')
    with st.expander('Đối chiếu một dự đoán test'):
        pu=st.selectbox('Hồ sơ kiểm chứng',range(len(profiles)),format_func=lambda j:profiles[j]['profile'])
        candidate=profiles[pu]['candidates'];target=profiles[pu]['target']
        rows=[]
        for name,arrkey in [('Popularity','popularity'),('Content TF-IDF','content'),('H1 GRU','h1'),('H2 Graph + Text','h2'),('H3 Hybrid','h3')]:
            rank=topk(arrays[arrkey][pu,candidate],ids[candidate],len(candidate))
            target_rank=[candidate[x] for x in rank].index(target)+1
            rows.append({'model':name,'target_rank':target_rank,'hit@10':target_rank<=10})
        st.write('Mục tiêu giữ lại:',str(titles[target]));st.dataframe(rows,hide_index=True)
        st.caption('Mục tiêu test chỉ được hiển thị để kiểm chứng, không được đưa vào lịch sử phục vụ.')
    with st.expander('Kiểm toán dữ liệu và cấu hình'):
        st.json(audit)
        st.write('Timestamp có nhiều mốc trùng, đơn vị chưa xác minh. Mọi thành phần học chỉ dùng train có timestamp nhỏ hơn mốc validation tương ứng. Lịch sử phục vụ cũng chỉ lấy timestamp nhỏ hơn mục tiêu. Cần dữ liệu gốc để xác minh ý nghĩa thời gian.')
        st.line_chart(pd.read_csv(ROOT/'artifacts/training.csv').pivot_table(index='epoch',columns='model',values='val_ndcg'))
    st.download_button('↓ Tải toàn bộ chỉ số',(ROOT/'artifacts/metrics.csv').read_bytes(),'metrics.csv','text/csv')
    st.download_button('↓ Tải kiểm toán',(ROOT/'artifacts/audit.json').read_bytes(),'audit.json','application/json')
with tabs[2]:
    st.subheader('Ba hướng cùng giải một bài toán')
    st.write('Báo cáo gốc có hai hướng. H3 dưới đây là hướng tích hợp được bổ sung cho sản phẩm demo.')
    cols=st.columns(3)
    for col,title,body in zip(cols,['01 / H1 · Chuỗi và thời gian','02 / H2 · Đồ thị và nội dung','03 / H3 · Xếp hạng lai'],[
        'GRU4Rec so sánh base, time gap và time decay. Học từ các tiền tố chuỗi train; chọn biến thể bằng NDCG validation. H1 không tự dự đoán được ID sản phẩm chưa học.',
        'LightGCN hai tầng, chuẩn hóa theo bậc nút, học BPR trên cạnh train. Kết hợp vector văn bản từ tiêu đề để có thể chấm sản phẩm chưa có tương tác.',
        'Chuẩn hóa điểm H1/H2 và popularity, tìm trọng số trên validation rồi cố định khi đo test. Kết quả có thể chọn trọng số 0 cho thành phần không giúp ích; chưa thể mặc định lai luôn tốt hơn.']):
        with col:st.markdown('#### '+title);st.write(body)
    st.code('Lịch sử + metadata → ID chung / split chung\n  ├─ H1: GRU + tín hiệu thời gian ────┐\n  └─ H2: LightGCN + nội dung ────────┤\n                                    ↓\n                         H3: phối hợp điểm\n                                    ↓\n               Lọc tồn kho → đa dạng → Top K → phản hồi',language=None)
    st.info('Phiên bản chạy hiện tại: TF-IDF bigram → SVD 64 chiều. Chưa chạy MiniLM/LLM; chưa khẳng định đây là mô hình tốt nhất cho doanh nghiệp.')
    st.write('Trọng số đã chọn:',audit['h3_weights'])
with tabs[3]:
    st.subheader('Từ demo đến thí điểm tại cửa hàng')
    st.write('Điểm triển khai phù hợp: trang chi tiết sản phẩm, trang chủ dành cho khách đã đăng nhập và đề xuất sau mua. Các bộ lọc kinh doanh phải chạy trước khi trả kết quả.')
    st.dataframe(pd.DataFrame([
        ['Dữ liệu','Mã khách ẩn danh, mã sản phẩm, thời điểm, loại sự kiện; catalog và tồn kho'],
        ['Tích hợp','Xuất top K qua CSV ở demo; xây API và đồng bộ tồn kho khi tích hợp thật'],
        ['Thử nghiệm','So sánh với popularity bằng A/B có phân nhóm cố định; ghi impression, click, cart, purchase'],
        ['KPI','CTR, conversion, doanh thu trên phiên; theo dõi tồn kho, đa dạng, độ trễ và hoàn trả'],
        ['Điều kiện nghiệm thu','Chốt ngưỡng và cỡ mẫu trước khi chạy; báo cáo khoảng tin cậy; chỉ rollout khi đạt KPI'],
        ['Vận hành','Phân quyền dữ liệu, chính sách lưu trữ, giám sát drift, phiên bản mô hình, fallback và rollback'],
    ],columns=['Hạng mục','Công việc']),hide_index=True)
    st.warning('Chưa kết nối doanh nghiệp, chưa có dữ liệu A/B hay bằng chứng tăng doanh số. Demo là nguyên mẫu kiểm chứng offline, chưa phải hệ thống production.')
    events=pd.DataFrame(st.session_state.get('events',[]),columns=['item_id','event','model','session_index'])
    st.write(f'{len(events)} phản hồi trong phiên demo. Phản hồi chưa được dùng để huấn luyện lại.')
    st.download_button('↓ Xuất phản hồi phiên',events.to_csv(index=False).encode(),'session_events.csv','text/csv')
    st.download_button('↓ Tải mẫu tồn kho',pd.DataFrame({'item_id':ids[:20],'available':[1]*20}).to_csv(index=False).encode(),'inventory.csv','text/csv')
st.divider()
st.caption('NHÓM 2 · Beauty Intelligence / Kết quả thực nghiệm có giới hạn · Không có số liệu kinh doanh giả lập')
