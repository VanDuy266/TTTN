"""Export aggregate dataset facts; no raw reviews or raw user IDs in the web artifact."""
from pathlib import Path
import json
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
def build():
    data=ROOT/'data';p=ROOT/'artifacts/web'
    a=json.loads((p/'manifest.json').read_text())['audit']
    frames={k:pd.read_csv(data/f'{k}.csv') for k in ['train','val','test']}
    cutoff=frames['val'].set_index('user_id').timestamp
    effective=frames['train'][frames['train'].timestamp<frames['train'].user_id.map(cutoff)]
    rows=[]
    for key,name,df,role in [
        ('raw_train','Huấn luyện gốc',frames['train'],'Dữ liệu trước khi loại mốc thời gian không phù hợp.'),
        ('train','Huấn luyện được sử dụng',effective,'Học trọng số mô hình và mã hóa sản phẩm.'),
        ('validation','Xác thực',frames['val'],'Chọn số vòng học, biến thể và trọng số kết hợp.'),
        ('test','Kiểm tra',frames['test'],'Tính chỉ số và đối chiếu sản phẩm thực tế; không dùng để học trọng số.')]:
        rows.append({'id':key,'name':name,'interactions':len(df),'users':df.user_id.nunique(),'items':df.item_id.nunique(),'purpose':role})
    profiles=json.loads((p/'profiles.json').read_text())
    hist=[len(x['history']) for x in profiles]
    result={'source':'Amazon All Beauty — tương tác đánh giá sản phẩm','interaction_note':'Một dòng là một tương tác trong dữ liệu đánh giá, không phải đơn hàng đã xác nhận.',
            'splits':rows,'catalog_items':a['catalog'],'warm_targets':sum(x['target_warm'] for x in profiles),'cold_targets':sum(not x['target_warm'] for x in profiles),
            'history_groups':[{'label':'Không có lịch sử trước thời điểm kiểm tra','users':sum(n==0 for n in hist)},
                              {'label':'Từ 1 đến 2 tương tác','users':sum(1<=n<=2 for n in hist)},
                              {'label':'Từ 3 đến 9 tương tác','users':sum(3<=n<=9 for n in hist)},
                              {'label':'Từ 10 tương tác trở lên','users':sum(n>=10 for n in hist)}],
            'time_status':'Chỉ dùng lịch sử có mốc nhỏ hơn thời điểm kiểm tra. Đơn vị thời gian gốc chưa được xác minh.',
            'metadata_status':'Mô hình văn bản sử dụng tiêu đề. Các trường mô tả bị rút thành [List] không được dùng như mô tả đầy đủ.'}
    (p/'study_data.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    print('Study facts exported:',[(r['id'],r['interactions'],r['users'],r['items']) for r in rows])
if __name__=='__main__':build()
