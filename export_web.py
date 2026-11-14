"""Build lightweight, immutable research artifacts for the standalone web server.
Run after train.py. Full-catalog evaluation permits repeat purchases for every model.
"""
import csv, hashlib, json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd

ROOT=Path(__file__).resolve().parent
MODELS=[
 {'id':'popularity','name':'Popularity','family':'Baseline','short':'Phổ biến','source':'popularity','description':'Xếp theo tần suất tương tác trong train.'},
 {'id':'content','name':'TF-IDF + SVD','family':'Baseline','short':'Nội dung','source':'content','description':'Hồ sơ nội dung có trọng số thời gian, dựa trên tiêu đề sản phẩm.'},
 {'id':'m1','name':'M1 · GRU4Rec','family':'H1','short':'GRU cơ sở','mode':'base','description':'Học thứ tự sản phẩm, không đưa khoảng cách thời gian vào đầu vào.'},
 {'id':'m2','name':'M2 · GRU + Time Gap','family':'H1','short':'Time Gap','mode':'gap','description':'Ghép log(1 + khoảng cách / scale) vào embedding đầu vào GRU.'},
 {'id':'m3','name':'M3 · GRU + Time Decay','family':'H1','short':'Time Decay','mode':'decay','description':'Nhân embedding lịch sử với exp(−age / scale) trước GRU.'},
 {'id':'h2','name':'H2 · LightGCN + Text','family':'H2','short':'Graph + Text','source':'graph','description':'LightGCN hai tầng, BPR và tiêu đề TF-IDF/SVD. Chưa phải MiniLM trong slide.'},
 {'id':'h2_tuned','name':'H2 · Blend chọn bằng validation','family':'Mở rộng','short':'H2 blend','source':'h2','description':'Trộn điểm graph-text với nội dung; validation hiện chọn graph weight = 0.'},
 {'id':'h3','name':'H3 · Mô hình tích hợp','family':'H3','short':'Hybrid','source':'h3','description':'Ngoài phạm vi hai hướng trong slide; trọng số hiện trùng baseline nội dung.'},
]

DISPLAY_MODELS={'popularity': ('Độ phổ biến', 'Đối chứng', 'Độ phổ biến'), 'content': ('Nội dung sản phẩm · TF-IDF/SVD', 'Đối chứng', 'Nội dung sản phẩm'), 'm1': ('M1 · GRU4Rec', 'Hướng 1', 'GRU cơ sở'), 'm2': ('M2 · Khoảng cách thời gian', 'Hướng 1', 'Khoảng cách thời gian'), 'm3': ('M3 · Suy giảm theo thời gian', 'Hướng 1', 'Suy giảm theo thời gian'), 'h2': ('H2 · Đồ thị và nội dung', 'Hướng 2', 'Đồ thị và nội dung'), 'h2_tuned': ('H2 · Kết hợp đồ thị và nội dung', 'Cấu hình phụ', 'H2 kết hợp'), 'h3': ('H3 · Mô hình tích hợp', 'Hướng 3', 'Mô hình tích hợp')}
for _m in MODELS:
 _m["name"],_m["family"],_m["short"]=DISPLAY_MODELS[_m["id"]]

def main():
 p=ROOT/'artifacts';out=p/'web';out.mkdir(exist_ok=True)
 audit=json.loads((p/'audit.json').read_text());profiles=json.loads((p/'profiles.json').read_text())
 ctx={x['profile']:x for x in json.loads((p/'evaluation_context.json').read_text())}
 cat=pd.read_csv(p/'catalog.csv').fillna('');catalog=cat.to_dict('records');warm=cat.in_train.to_numpy(dtype=bool)
 for j,profile in enumerate(profiles):
  profile.update({'row':j,'history_records':ctx[profile['profile']]['history'],'cutoff':ctx[profile['profile']]['cutoff'],
                  'history_length':len(profile['history']),'target_warm':bool(warm[profile['target']]),'fallback':not bool(profile['history'])})
  assert all(x['timestamp']<profile['cutoff'] for x in profile['history_records'])
 targets=np.array([x['target'] for x in profiles]);candidates=np.array([sorted(x['candidates']) for x in profiles])
 metrics=[];hashes={};per_user={};legacy=np.load(p/'serving.npz',allow_pickle=False);variants=np.load(p/'h1_variants.npz',allow_pickle=False)
 for model in MODELS:
  scores=(variants[model['mode']] if 'mode' in model else legacy[model['source']]).astype('float32')
  assert scores.shape==(len(profiles),len(catalog));assert np.isfinite(scores).all()
  target=out/f"{model['id']}.npy";np.save(target,scores,allow_pickle=False);hashes[model['id']]=hashlib.sha256(target.read_bytes()).hexdigest()
  for protocol in ['full_catalog','sampled100']:
   base=np.broadcast_to(np.arange(len(catalog)),scores.shape) if protocol=='full_catalog' else candidates
   values=np.take_along_axis(scores,base,axis=1)
   ordered=np.take_along_axis(base,np.argsort(-values,axis=1,kind='stable'),axis=1)
   ranks=(ordered==targets[:,None]).argmax(1)+1
   hits=(ranks<=10).astype(float);ndcg=np.where(ranks<=10,1/np.log2(ranks+1),0.)
   per_user[model['id'],protocol]=ndcg
   for cohort in ['all','warm','cold']:
    mask=np.ones(len(profiles),dtype=bool) if cohort=='all' else (warm[targets] if cohort=='warm' else ~warm[targets])
    n=int(mask.sum());rng=np.random.default_rng(42)
    boots=ndcg[mask][rng.integers(0,n,(500,n))].mean(1)
    low,high=np.quantile(boots,[.025,.975])
    metrics.append({'model':model['id'],'protocol':protocol,'cohort':cohort,'users':n,'recall10':float(hits[mask].mean()),'hits10':int(hits[mask].sum()),
                    'ndcg10':float(ndcg[mask].mean()),'coverage10':len(np.unique(ordered[mask,:10]))/len(catalog),
                    'ndcg_ci_low':float(low),'ndcg_ci_high':float(high)})
 legacy.close();variants.close()
 contrasts=[]
 for protocol in ['full_catalog','sampled100']:
  for model in ['m1','m2','m3','h2']:
   delta=per_user[model,protocol]-per_user['content',protocol];rng=np.random.default_rng(42)
   bs=delta[rng.integers(0,len(profiles),(500,len(profiles)))].mean(1)
   lo,hi=np.quantile(bs,[.025,.975]);contrasts.append({'model':model,'reference':'content','protocol':protocol,'ndcg_delta':float(delta.mean()),'ci_low':float(lo),'ci_high':float(hi)})
 def write(name,data):(out/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 write('catalog.json',catalog);write('profiles.json',profiles);write('metrics.json',metrics);write('contrasts.json',contrasts)
 public_models=[{k:v for k,v in m.items() if k not in {'source','mode'}} for m in MODELS]
 run_id=hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()[:12]
 manifest={'run_id':run_id,'generated_at':datetime.now(timezone.utc).isoformat(),'models':public_models,'audit':audit,
           'score_sha256':hashes,'top_k':10,'default_models':['popularity','content','m1','m2','m3','h2','h3'],
           'execution_mode':'saved_scores','execution_note':'Xếp hạng lại từ điểm đã lưu sau huấn luyện; không huấn luyện hay suy luận lại mạng neural khi bấm nút.',
           'protocols':{'full_catalog':'Toàn bộ 2.934 sản phẩm, bao gồm sản phẩm từng xuất hiện trong lịch sử.',
                        'sampled100':'Một sản phẩm thực tế và 99 sản phẩm đối chứng cố định; cùng tập ứng viên cho mọi mô hình.'},
           'history_median':float(np.median([x['history_length'] for x in profiles])),
           'history_short_count':sum(x['history_length']<=2 for x in profiles),
           'full_catalog_policy':'repeat_allowed_v1','legacy_note':'Bảng metrics trong artifacts/ ở phiên bản cũ có lọc lịch sử khi đánh giá full catalog. Web này dùng artifacts/web/ với giao thức cho phép mua lại công bố rõ.'}
 write('manifest.json',manifest)
 with (out/'metrics.csv').open('w',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(metrics[0]),lineterminator="\n");writer.writeheader();writer.writerows(metrics)
 print('Web artifacts ready:',run_id,len(profiles),'profiles,',len(metrics),'metric rows')
 print(pd.DataFrame(metrics).query("protocol=='full_catalog' and cohort=='all'")[['model','recall10','ndcg10']].to_string(index=False))
if __name__=='__main__':main()
