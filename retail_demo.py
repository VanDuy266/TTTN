"""Retail demonstration with separate customer, operations, and research views."""
from pathlib import Path
import hashlib, hmac, html, json, os, time, uuid
import numpy as np
import pandas as pd
import streamlit as st
from src.business import RetailStore, product_group, recommend, funnel

ROOT=Path(__file__).resolve().parent
st.set_page_config(page_title='Beauty Studio · Retail Pilot',page_icon='✦',layout='wide')

@st.cache_resource
def resources():
    p=ROOT/'artifacts'
    cat=pd.read_csv(p/'catalog.csv',dtype={'item_id':str}).fillna('')
    cat['group']=cat.title.map(product_group)
    arrays=dict(np.load(p/'serving.npz',allow_pickle=False))
    profiles=json.loads((p/'profiles.json').read_text())
    store=RetailStore(os.environ.get('RETAIL_DB_PATH',str(ROOT/'runtime/retail.sqlite')))
    store.seed_sample(cat)
    return cat,arrays,profiles,store

cat,arrays,profiles,store=resources()
for key,value in {'visitor':uuid.uuid4().hex,'cart':{},'checkout_key':uuid.uuid4().hex}.items():
    if key not in st.session_state:st.session_state[key]=value
visitor=st.session_state.visitor
money=lambda value:f'{int(value):,}'.replace(',','.')+' ₫'
sample=store.setting('inventory_source')=='sample'
st.markdown('''<style>
.block-container{padding-top:3.8rem;max-width:1500px;padding-bottom:3rem}
[data-testid="stSidebar"]{background:#f0f0e9;border-right:1px solid #dce1d8}
h1,h2,h3{letter-spacing:-.04em;color:#183c31}
h1{font-size:3.15rem!important;line-height:1.08!important}h2{font-size:1.8rem!important}
[data-testid="stMetric"]{background:white;border:1px solid #e2e5db;border-radius:14px;padding:16px}
.eyebrow{font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:#496657;font-weight:700}
.hero{background:#e5ecdf;border-radius:24px;padding:35px 38px;margin:8px 0 26px;position:relative;overflow:hidden}
.hero p{max-width:650px;color:#496254;font-size:1.03rem;line-height:1.7}.hero small{color:#496254}
.flow{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.flow span{background:#f9faf6;border:1px solid #cbd7c4;padding:7px 11px;border-radius:100px;font-size:.78rem;color:#345244}
.card{background:white;border:1px solid #e1e5da;border-radius:18px;overflow:hidden;margin-top:10px}
.card-art{height:130px;display:flex;align-items:center;justify-content:center;position:relative;background:#ede9e1;color:#485e4a}
.card-art small{position:absolute;bottom:7px;right:12px;font-size:.62rem;opacity:.65}
.card-body{padding:17px 18px 14px}.card-title{font-size:.94rem;line-height:1.5;height:67px;overflow:hidden;font-weight:600;color:#253a30;margin:8px 0}
.card-group{color:#68745e;letter-spacing:.08em;font-size:.65rem;text-transform:uppercase}.card-price{font-size:1.15rem;font-weight:700;color:#234b37}.card-stock{color:#738070;font-size:.74rem;margin-left:10px}
.reason{font-size:.75rem;color:#6d796c;min-height:38px;margin-top:10px}.tag{display:inline-block;border-radius:6px;background:#e9efdf;color:#3c5c37;font-size:.7rem;padding:4px 8px}
.notice{font-size:.8rem;color:#647460;background:#eef0e8;padding:12px 17px;border-radius:10px;margin-bottom:14px}
.section-note{font-size:.87rem;color:#667461;line-height:1.65}
@media(max-width:640px){h1{font-size:2rem!important}.hero{padding:23px 20px;border-radius:18px}.hero p{font-size:.9rem}.flow{gap:5px;margin:12px 0}.flow span{font-size:.67rem;padding:5px 8px}.block-container{padding-left:1rem;padding-right:1rem}}
</style>''',unsafe_allow_html=True)

with st.sidebar:
    st.markdown('## ✦ BEAUTY STUDIO')
    st.caption('KỊCH BẢN CỬA HÀNG MỸ PHẨM · NHÓM 2')
    view=st.radio('Không gian làm việc',['Cửa hàng trải nghiệm','Điều hành cửa hàng','Kiểm chứng & tích hợp'],key='workspace')
    st.divider()
    st.markdown('**Bản thí điểm có thể thao tác**')
    st.caption('Xem gợi ý → thêm giỏ → tạo đơn thử nghiệm → kiểm tra dashboard và tồn kho.')
    st.warning('Giá và tồn kho minh họa. Đơn hàng mô phỏng, không thanh toán.' if sample else 'Giá và tồn kho từ CSV người vận hành nhập. Đơn vẫn là mô phỏng, không thanh toán.')
    st.caption('Beauty Studio là tên kịch bản minh họa, chưa đại diện doanh nghiệp đối tác.')
    st.caption('Chưa có SSO/phân quyền theo vai trò; có thể đặt mật khẩu vận hành. Không nhập dữ liệu khách hàng thật vào bản demo công khai.')


def banner(label,title,description):
    st.markdown(f'<div class="eyebrow">{html.escape(label)}</div><div class="hero"><h1>{title}</h1><p>{html.escape(description)}</p><div class="flow"><span>01 · Nhu cầu khách</span><span>02 · Gợi ý còn hàng</span><span>03 · Giỏ & đơn thử</span><span>04 · Đo lường</span></div></div>',unsafe_allow_html=True)


def artwork(group):
    # Generic vector illustrations of product families, never presented as actual SKU photographs.
    bodies={
        'Chăm sóc da':'<rect x="65" y="33" width="50" height="66" rx="9" fill="#a9bba0"/><rect x="76" y="17" width="28" height="20" rx="3" fill="#43654b"/><rect x="72" y="57" width="36" height="26" rx="3" fill="#f8f4e9"/>',
        'Chăm sóc tóc':'<rect x="66" y="32" width="48" height="70" rx="14" fill="#b39a77"/><rect x="77" y="20" width="25" height="17" rx="4" fill="#466651"/><rect x="73" y="57" width="34" height="27" rx="3" fill="#f8f4e9"/>',
        'Trang điểm':'<rect x="76" y="51" width="28" height="53" rx="4" fill="#425f4b"/><path d="M79 52V27L101 17V52Z" fill="#bd7f74"/><rect x="76" y="59" width="28" height="8" fill="#d8c19e"/>',
        'Cọ & dụng cụ':'<rect x="86" y="60" width="10" height="48" rx="4" fill="#c1a379"/><rect x="82" y="48" width="18" height="24" rx="3" fill="#b5b9ae"/><path d="M78 49Q67 13 91 15Q115 13 104 49Z" fill="#52684d"/>',
        'Chăm sóc móng':'<rect x="69" y="52" width="42" height="48" rx="8" fill="#b88c88"/><rect x="77" y="20" width="26" height="37" rx="3" fill="#405c48"/>'}
    return '<svg width="180" height="120" viewBox="0 0 180 120" aria-hidden="true"><ellipse cx="90" cy="108" rx="43" ry="6" fill="#d9d7cb"/>'+bodies.get(group,bodies['Chăm sóc da'])+'</svg>'


@st.dialog('Chi tiết sản phẩm · Bản thử nghiệm')
def details(row):
    st.subheader(str(row['title']));st.write(str(row['item_id']))
    st.write(money(row['price']));st.write(f"Còn {row['stock']} sản phẩm trong tồn kho {'minh họa' if sample else 'đã nhập'}.")
    st.caption('Chưa có mô tả, thành phần hoặc ảnh gốc đã xác minh. Minh họa nhóm sản phẩm không phải ảnh SKU. Không dùng gợi ý này thay cho tư vấn chuyên môn về da.')


def storefront():
    banner('RETAIL EXPERIENCE / CỬA HÀNG', 'Chọn đúng nhu cầu.<br>Tìm sản phẩm phù hợp.',
           'Trải nghiệm một điểm bán có gợi ý sản phẩm: chọn nhu cầu hoặc lịch sử, xem hàng còn bán, thêm giỏ và tạo đơn thử nghiệm. Mỗi thao tác được nối về màn hình điều hành.')
    controls,cartcol=st.columns([3,1])
    with controls:
        a,b=st.columns([1,1])
        profile=a.selectbox('Hồ sơ trải nghiệm',['Khách mới']+[p['profile'] for p in profiles],key='profile')
        group=b.selectbox('Nhu cầu mua sắm',['Tất cả']+sorted(set(cat['group'])-{'Chưa phân nhóm'}),key='shopping_group')
        options=cat[cat['group'].ne('Chưa phân nhóm')]
        if group!='Tất cả':options=options[options['group']==group]
        seeds=st.multiselect('Sản phẩm bạn đang quan tâm',options.item_id.tolist(),format_func=lambda i:cat.loc[cat.item_id==i,'title'].iloc[0][:110],max_selections=4,key='needs')
        if profile=='Khách mới' and not seeds:st.caption('Chưa có lịch sử: hiển thị sản phẩm phổ biến. Chọn sản phẩm quan tâm để nhận gợi ý theo nội dung.')
        elif seeds:st.caption('Gợi ý đang dựa trên nội dung của các sản phẩm bạn chọn.')
        else:
            history=next(p['history'] for p in profiles if p['profile']==profile)
            st.caption(f'Hồ sơ ẩn danh có {len(history)} tương tác trước mục tiêu test. Mục tiêu test không được đưa vào lịch sử.')
            with st.expander('Lịch sử làm căn cứ gợi ý'):
                st.dataframe(cat.iloc[history][['title','group']],hide_index=True,width='stretch')
        inventory=store.inventory();variant=store.variant(visitor)
        start=time.perf_counter()
        rec,route=recommend(cat,arrays,profiles,profile,seeds,inventory,variant,group,st.session_state.cart,9)
        elapsed=(time.perf_counter()-start)*1000
        signature=hashlib.sha256(json.dumps([profile,group,seeds,variant,route,rec.item_id.tolist(),store.setting('inventory_revision')],ensure_ascii=False).encode()).hexdigest()
        if st.session_state.get('exposure_signature')!=signature:
            st.session_state.request_id=store.expose(visitor,variant,route,rec.item_id.tolist(),elapsed)
            st.session_state.exposure_signature=signature
        request_id=st.session_state.request_id
        st.subheader('Gợi ý cho bạn')
        st.caption(f'{len(rec)} lựa chọn đang bán · Đã lọc hàng hết và giỏ hiện tại · Giá {"minh họa" if sample else "từ CSV đã nhập"}')
        if rec.empty:st.info('Không có sản phẩm đáp ứng điều kiện. Thử nhu cầu khác hoặc kiểm tra tồn kho ở màn hình điều hành.')
        for offset in range(0,len(rec),3):
            columns=st.columns(3)
            for col,(_,row) in zip(columns,rec.iloc[offset:offset+3].iterrows()):
                with col:
                    reason='Phổ biến trong dữ liệu huấn luyện' if 'popularity' in route else 'Dựa trên sở thích bạn chọn' if seeds else 'Dựa trên lịch sử tương tác ẩn danh'
                    st.markdown(f'<div class="card"><div class="card-art">{artwork(row["group"])}<small>Minh họa nhóm sản phẩm</small></div><div class="card-body"><span class="card-group">{html.escape(row["group"])}</span><div class="card-title" title="{html.escape(row["title"],quote=True)}">{html.escape(row["title"])}</div><span class="card-price">{money(row["price"])}</span><span class="card-stock">Còn {int(row["stock"])}</span><div class="reason">{reason}</div></div></div>',unsafe_allow_html=True)
                    c1,c2=st.columns([1,1])
                    if c1.button('Chi tiết',key=f'detail_{row.item_id}',width='stretch'):
                        store.action(visitor,request_id,row.item_id,'click');details(row.to_dict())
                    if c2.button('Thêm giỏ',key=f'add_{row.item_id}',type='primary',width='stretch'):
                        store.action(visitor,request_id,row.item_id,'click');store.action(visitor,request_id,row.item_id,'cart')
                        st.session_state.cart[row.item_id]={'quantity':1,'request_id':request_id}
                        st.session_state.checkout_key=uuid.uuid4().hex;st.rerun()
        with st.expander('Thông tin gợi ý và dữ liệu phiên'):
            st.write('Nhóm phục vụ:',variant,'· Tuyến xếp hạng:',route)
            st.caption('Điểm hồ sơ đã được tính trước. Chọn sở thích dùng tương đồng nội dung; thao tác giỏ hàng chưa huấn luyện lại GRU/GNN. Tốc độ xếp lại không phải latency suy luận mô hình mới.')
            st.code(request_id,language=None)
            st.download_button('Xuất đề xuất CSV',rec[['item_id','title','group','price','stock']].to_csv(index=False).encode('utf-8-sig'),'retail_recommendations.csv','text/csv')
    with cartcol:
        st.subheader('Giỏ thử nghiệm')
        st.caption('Không thanh toán thật. Giá và tồn kho được kiểm tra lại khi xác nhận.')
        if 'last_order' in st.session_state:st.success('Đã tạo '+st.session_state.last_order)
        cart=st.session_state.cart;stock=store.inventory().set_index('item_id');total=0
        if not cart:st.info('Chọn “Thêm giỏ” để bắt đầu hành trình.')
        for item,entry in list(cart.items()):
            title=cat.loc[cat.item_id==item,'title'].iloc[0]
            st.markdown('**'+title[:85]+'**')
            price=int(stock.loc[item,'price']) if item in stock.index else 0;total+=price*entry['quantity']
            st.caption(f"{entry['quantity']} × {money(price)}")
            if st.button('Bỏ khỏi giỏ',key='remove_'+item):
                del st.session_state.cart[item];st.session_state.checkout_key=uuid.uuid4().hex;st.rerun()
        st.divider();st.metric('Tạm tính mô phỏng',money(total))
        if st.button('Tạo đơn thử nghiệm',disabled=not cart,type='primary',width='stretch'):
            try:
                order=store.checkout(visitor,cart,st.session_state.checkout_key)
                st.session_state.last_order=order;st.session_state.cart={};st.session_state.checkout_key=uuid.uuid4().hex;st.rerun()
            except ValueError as exc:st.error(str(exc))
        st.caption('Sau khi tạo đơn, mở “Điều hành cửa hàng” để đối chiếu đơn, sự kiện và lượng hàng đã trừ.')


def operations():
    password=os.environ.get('RETAIL_ADMIN_PASSWORD')
    if password:
        entered=st.text_input('Mật khẩu người vận hành',type='password',key='admin_password')
        if not hmac.compare_digest(entered,password):
            st.info('Nhập mật khẩu được quản trị viên cấp để xem dữ liệu và thay đổi tồn kho.');return
    banner('RETAIL OPERATIONS / ĐIỀU HÀNH','Từ gợi ý đến đơn thử.<br>Mỗi bước đều đối chiếu được.',
           'Dành cho người vận hành: kiểm tra danh mục đang bán, nhập tồn kho, theo dõi luồng gợi ý và kiểm tra đơn mô phỏng. Số liệu được tính từ thao tác trong ứng dụng này.')
    tables=store.tables();events=tables['events'];orders=tables['orders'];inventory=store.inventory()
    cols=st.columns(4)
    cols[0].metric('Sản phẩm sẵn bán',int(((inventory.active==1)&(inventory.stock>0)).sum()))
    cols[1].metric('Lượt trả danh sách',len(tables['requests']))
    cols[2].metric('Đơn thử đã tạo',len(orders))
    cols[3].metric('Giá trị đơn mô phỏng',money(orders.total.sum() if len(orders) else 0))
    st.caption('Số liệu demo trên instance hiện tại, không phải doanh số doanh nghiệp. SQLite có thể bị mất khi Render Free khởi động lại hoặc triển khai lại.')
    funnel_tab,inventory_tab,orders_tab,rollout_tab=st.tabs(['Hành trình & A/B','Danh mục & tồn kho','Đối chiếu đơn','Kế hoạch áp dụng'])
    with funnel_tab:
        st.subheader('Phễu từ gợi ý đến hành động')
        counts={event:int((events.event==event).sum()) for event in ['impression','click','cart','purchase']}
        st.bar_chart(pd.DataFrame({'Giai đoạn':['01 · Hiển thị','02 · Click','03 · Thêm giỏ','04 · Đặt thử'],'Số lượng':list(counts.values())}).set_index('Giai đoạn'),color='#446A4E')
        st.caption('Impression = sản phẩm được đưa vào danh sách đã render, chưa đo nhìn thấy trong viewport. Click = mở chi tiết hoặc bấm thêm giỏ; mỗi loại hành động được khử trùng theo request và sản phẩm. Purchase = SKU được xác nhận trong đơn mô phỏng.')
        table=funnel(tables)
        if table.empty:st.info('Chưa có dữ liệu hành trình. Thực hiện một lượt xem và tạo đơn ở cửa hàng.')
        else:st.dataframe(table,hide_index=True,width='stretch')
        st.caption('CTR = click/impression. Conversion phiên = số phiên có đơn/số phiên nhận gợi ý. Các tỷ lệ này chỉ mô tả demo, chưa dùng để kết luận hiệu quả kinh doanh.')
        with st.form('experiment'):
            enabled=st.checkbox('Bật phân nhóm A/B cho những lượt gợi ý tiếp theo',value=store.setting('experiment_enabled','0')=='1')
            st.caption('Đối chứng dùng popularity; nhóm thử dùng tuyến cá nhân hóa. Phân nhóm ổn định theo mã phiên trình duyệt, chưa phải tài khoản khách hàng thật.')
            if st.form_submit_button('Lưu chế độ thử nghiệm'):
                store.configure('experiment_enabled','1' if enabled else '0');st.success('Đã lưu. Chỉ các lượt gợi ý tiếp theo dùng chế độ mới.')
        if len(events):
            st.download_button('Xuất log sự kiện có request_id',events.to_csv(index=False).encode(),'events.csv','text/csv')
            with st.expander('Log gần nhất'):
                st.dataframe(events.tail(30),hide_index=True,width='stretch')
    with inventory_tab:
        st.subheader('Kiểm soát những gì được phép đề xuất')
        st.info('Nguồn hiện tại: '+('tồn kho và giá sinh để minh họa' if sample else 'snapshot CSV người vận hành đã nhập')+'. Nhập snapshot mới sẽ tắt bán các mã bị bỏ khỏi tệp.')
        st.caption('CSV: item_id,stock,price,active. stock là số nguyên không âm; price là VND nguyên; active nhận 0/1. Không hỗ trợ SKU ngoài catalog mô hình trong bản này.')
        with st.form('stock_import'):
            upload=st.file_uploader('Chọn CSV tồn kho và giá',type='csv')
            apply=st.form_submit_button('Kiểm tra và thay snapshot tồn kho')
            if apply:
                if upload is None:st.error('Chọn tệp CSV trước khi áp dụng.')
                else:
                    try:
                        data=pd.read_csv(upload,dtype={'item_id':str});n=store.import_inventory(data,cat.item_id)
                        st.session_state.stock_message=f'Đã nhập {n} mã; mã không có trong snapshot đã bị tắt bán.';st.rerun()
                    except (ValueError,pd.errors.ParserError) as exc:st.error(str(exc))
        if st.session_state.get('stock_message'):st.success(st.session_state.stock_message)
        combined=cat[['item_id','title','group']].merge(inventory,on='item_id',how='inner')
        search=st.text_input('Tìm tên hoặc mã sản phẩm')
        if search:combined=combined[combined.title.str.contains(search,case=False,regex=False)|combined.item_id.str.contains(search,case=False,regex=False)]
        st.dataframe(combined,hide_index=True,width='stretch')
        st.download_button('Tải snapshot hiện tại',inventory.to_csv(index=False).encode(),'inventory_snapshot.csv','text/csv')
        st.caption('Phân nhóm sản phẩm được suy ra từ từ khóa trong tiêu đề, chưa thay thế taxonomy do doanh nghiệp xác nhận.')
    with orders_tab:
        st.subheader('Kiểm tra một đơn từ đầu đến cuối')
        if orders.empty:st.info('Chưa có đơn thử. Thêm sản phẩm vào giỏ và chọn “Tạo đơn thử nghiệm”.')
        else:
            order=st.selectbox('Mã đơn thử',orders.id.tolist()[::-1]);row=orders[orders.id==order].iloc[0]
            st.write('Thời điểm UTC:',row.created_at,'· Giá trị mô phỏng:',money(row.total))
            lines=tables['order_items'];lines=lines[lines.order_id==order].merge(cat[['item_id','title']],on='item_id')
            st.dataframe(lines[['item_id','title','quantity','price']],hide_index=True,width='stretch')
            st.caption('Tạo đơn và trừ tồn kho là một giao dịch SQLite: thiếu hàng sẽ hủy toàn bộ. Gửi lại cùng khóa checkout không tạo đơn hay trừ hàng lần hai.')
            st.download_button('Xuất đơn thử',lines.to_csv(index=False).encode('utf-8-sig'),order+'.csv','text/csv')
    with rollout_tab:
        st.subheader('Đưa vào doanh nghiệp ở đâu?')
        st.dataframe(pd.DataFrame([
            ['Khách hàng','Trang chủ / trang chi tiết','Nhận đề xuất phù hợp nhu cầu; bấm xem, thêm giỏ'],
            ['Nhân viên vận hành','CMS / hệ thống kho','Đồng bộ mã hàng, giá, hàng còn bán; xử lý ngoại lệ'],
            ['Quản lý kinh doanh','Dashboard / báo cáo A/B','Đo CTR, chuyển đổi, doanh thu trên phiên và guardrail'],
            ['Kỹ thuật / dữ liệu','Dịch vụ gợi ý + pipeline','Đảm bảo timestamp, quyền dữ liệu, version, fallback và rollback'],
        ],columns=['Người dùng','Điểm tích hợp','Công việc']),hide_index=True,width='stretch')
        st.markdown('**Lộ trình đề xuất**: chuẩn hóa dữ liệu → chạy shadow → A/B có cỡ mẫu được chốt trước → triển khai khi đạt tiêu chí nghiệm thu.')
        st.write('Demo hiện thực hiện được lọc hàng, hành trình giỏ/đơn mô phỏng, sự kiện có truy vết và phễu vận hành. Để dùng thật cần API catalog/kho/đơn hàng, xác thực phân quyền, cơ sở dữ liệu bền vững và đo lường trên traffic thật.')
        st.download_button('Tải đặc tả tích hợp và nghiệm thu',(ROOT/'docs/PILOT.md').read_bytes(),'PILOT.md','text/markdown')


def evidence():
    banner('EVIDENCE / KIỂM CHỨNG & TÍCH HỢP','Mô hình là một thành phần.<br>Quy trình mới tạo ra sản phẩm.',
           'H1/H2/H3 cùng phục vụ bài toán chọn sản phẩm; lớp nghiệp vụ quyết định sản phẩm nào được bán, sự kiện nào được đo và khi nào có đủ bằng chứng để triển khai.')
    st.subheader('Ba hướng nối với nghiệp vụ ra sao?')
    st.dataframe(pd.DataFrame([
        ['H1 · GRU theo thời gian','Lịch sử mua/xem có thứ tự và timestamp','Điểm ưu tiên theo hồ sơ đã học','Không dự đoán tốt SKU chưa học; chưa cập nhật online trong demo'],
        ['H2 · Đồ thị + nội dung','Cạnh train và tiêu đề sản phẩm','Điểm cộng tác và tương đồng nội dung','Phiên bản này dùng TF-IDF/SVD, không phải MiniLM'],
        ['H3 · Tích hợp','Điểm H1/H2/popularity trên cùng ID','Tuyến gợi ý được chọn bằng validation','Trọng số hiện chọn content; chưa chứng minh cải thiện của hybrid'],
        ['Lớp nghiệp vụ','Tồn kho, trạng thái bán, nhu cầu, giỏ','Danh sách được phép phục vụ và đơn thử','Chạy thật trong demo; cần thay adapter khi nối hệ thống doanh nghiệp'],
        ['Lớp đo lường','request_id + impression/click/cart/purchase','Dashboard, truy vết, dữ liệu thử nghiệm A/B','Không suy ra tăng doanh thu từ số liệu mô phỏng'],
    ],columns=['Thành phần','Đầu vào','Đầu ra dùng ở đâu','Giới hạn']),hide_index=True,width='stretch')
    st.code('Catalog + sự kiện mua/xem\n       ↓ kiểm tra ID và thời gian\nH1: chuỗi ──┐\nH2: đồ thị ─┼→ H3: điểm gợi ý → luật bán hàng → danh sách có request_id\nNội dung ───┘                           ↓\n                                click → giỏ → đơn\n                                         ↓\n                               kho + log + dashboard',language=None)
    st.subheader('Bằng chứng offline hiện có')
    metrics=pd.read_csv(ROOT/'artifacts/metrics.csv');audit=json.loads((ROOT/'artifacts/audit.json').read_text())
    protocol=st.radio('Không gian đánh giá',['Toàn bộ danh mục','100 ứng viên cố định'],horizontal=True,key='evaluation_space')
    split='test_full_catalog' if protocol=='Toàn bộ danh mục' else 'test'
    rows=metrics[(metrics.split==split)&(metrics.cohort=='all')]
    st.dataframe(rows[['model','users','Recall@10','NDCG@10','Coverage@10']],hide_index=True,width='stretch')
    st.warning('Validation đã chọn trọng số graph = 0 và H1 = 0. H2/H3 hiện trùng baseline nội dung. Chưa có bằng chứng mô hình lai tốt hơn; chưa thể gọi là mô hình đạt hiệu quả kinh doanh.')
    st.caption('Báo cáo gốc có hai hướng; H3 là đề xuất tích hợp. Offline dùng dữ liệu Amazon, không phải khách hàng doanh nghiệp. Giá/tồn kho và đơn mô phỏng không tham gia huấn luyện hoặc bảng điểm này.')
    with st.expander('Cấu hình và giới hạn nghiên cứu'):
        st.json(audit)
        st.write('Timestamp rút gọn chưa xác minh đơn vị. Đã bỏ các train event trùng/qua validation tương ứng, giữ split theo user; chưa có split thời gian toàn hệ thống. Catalog được giả định có sẵn trước mục tiêu. Một seed, chưa phải chứng minh tổng quát hóa.')
    st.subheader('Ranh giới sẵn sàng triển khai')
    st.dataframe(pd.DataFrame([
        ['Đã chạy','Gợi ý theo nội dung/hồ sơ, luật tồn kho, giỏ, đơn mô phỏng, log truy vết, dashboard, CSV'],
        ['Cần kết nối','Catalog/POS/CRM/OMS thật; timestamp gốc; đồng ý và phạm vi sử dụng dữ liệu'],
        ['Cần hoàn thiện','API có xác thực, phân quyền quản trị, DB bền vững, giám sát, khôi phục và load test'],
        ['Cần nghiệm thu','A/B có nhóm cố định, cỡ mẫu/MDE, KPI chính và guardrail thống nhất trước'],
    ],columns=['Trạng thái','Phạm vi']),hide_index=True,width='stretch')
    st.download_button('Tải kết quả offline',(ROOT/'artifacts/metrics.csv').read_bytes(),'metrics.csv','text/csv')
    st.download_button('Tải đánh giá học thuật',(ROOT/'docs/REVIEW.md').read_bytes(),'REVIEW.md','text/markdown')

if view=='Cửa hàng trải nghiệm':storefront()
elif view=='Điều hành cửa hàng':operations()
else:evidence()
st.divider()
st.caption('NHÓM 2 · Kịch bản thí điểm cửa hàng mỹ phẩm · Đơn mô phỏng, không thanh toán · Số liệu vận hành lấy từ sự kiện trong demo')
