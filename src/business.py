"""Single-instance retail pilot: business rules, attributable events, and atomic demo orders.

SQLite is a prototype adapter. A real deployment needs authenticated roles and a durable DB.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib, json, sqlite3, uuid
from pathlib import Path
import numpy as np
import pandas as pd
from src.ranking import diversify, scale


def product_group(title):
    title=str(title).lower()
    if any(x in title for x in ['brush','sponge','applicator','makeup bag','mirror','organizer']):return 'Cọ & dụng cụ'
    if any(x in title for x in ['hair','wig','shampoo','conditioner','scalp','braid']):return 'Chăm sóc tóc'
    if any(x in title for x in ['skin','serum','moistur','sunscreen','cleanser','facial','lotion','face cream']):return 'Chăm sóc da'
    if any(x in title for x in ['lipstick','mascara','eyeliner','eyeshadow','foundation','concealer','makeup','blush','lip gloss']):return 'Trang điểm'
    if any(x in title for x in ['nail','manicure','pedicure','polish']):return 'Chăm sóc móng'
    return 'Chưa phân nhóm'


def validate_inventory(frame, catalog_ids):
    required={'item_id','stock','price','active'}
    if not required.issubset(frame.columns):raise ValueError('Cần đủ cột item_id, stock, price, active.')
    data=frame[list(sorted(required))].copy()
    if data.isna().any().any():raise ValueError('Không được để trống giá trị.')
    data['item_id']=data.item_id.astype(str).str.strip()
    if data.item_id.duplicated().any():raise ValueError('Mỗi item_id chỉ được xuất hiện một lần.')
    unknown=set(data.item_id)-set(catalog_ids)
    if unknown:raise ValueError(f'{len(unknown)} mã không có trong catalog mô hình; cần đồng bộ catalog trước.')
    if data.empty:raise ValueError('Tệp không có sản phẩm.')
    for col in ['stock','price','active']:
        try:values=pd.to_numeric(data[col],errors='raise').to_numpy(dtype=float)
        except (ValueError,TypeError):raise ValueError(f'{col} phải là số.') from None
        if not np.isfinite(values).all() or (values<0).any() or (values%1!=0).any():
            raise ValueError(f'{col} phải là số nguyên không âm, hữu hạn.')
        limit={'stock':10**6,'price':10**9,'active':1}[col]
        if (values>limit).any():raise ValueError(f'{col} vượt giới hạn nhập liệu.')
        data[col]=values.astype('int64')
    if not data.active.isin([0,1]).all():raise ValueError('active chỉ nhận 0 hoặc 1.')
    if ((data.active==1)&(data.price<=0)).any():raise ValueError('Sản phẩm đang bán phải có giá lớn hơn 0.')
    return data


class RetailStore:
    def __init__(self,path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.connection() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS inventory(item_id TEXT PRIMARY KEY, stock INTEGER NOT NULL CHECK(stock>=0),price INTEGER NOT NULL CHECK(price>=0),active INTEGER NOT NULL CHECK(active IN (0,1)));
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,visitor TEXT NOT NULL,variant TEXT NOT NULL,route TEXT NOT NULL,created_at TEXT NOT NULL,latency_ms REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,request_id TEXT NOT NULL,visitor TEXT NOT NULL,item_id TEXT NOT NULL,event TEXT NOT NULL CHECK(event IN ('impression','click','cart','purchase')),variant TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(request_id,item_id,event),FOREIGN KEY(request_id) REFERENCES requests(id));
            CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,visitor TEXT NOT NULL,total INTEGER NOT NULL,created_at TEXT NOT NULL,checkout_key TEXT NOT NULL UNIQUE);
            CREATE TABLE IF NOT EXISTS order_items(order_id TEXT NOT NULL,item_id TEXT NOT NULL,quantity INTEGER NOT NULL,price INTEGER NOT NULL,PRIMARY KEY(order_id,item_id),FOREIGN KEY(order_id) REFERENCES orders(id));
            ''')
    @contextmanager
    def connection(self):
        db=sqlite3.connect(self.path,timeout=15);db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            yield db;db.commit()
        except Exception:
            db.rollback();raise
        finally:db.close()
    @staticmethod
    def now():return datetime.now(timezone.utc).isoformat()
    def setting(self,key,default=''):
        with self.connection() as db:
            row=db.execute('SELECT value FROM settings WHERE key=?',(key,)).fetchone()
            return row['value'] if row else default
    def configure(self,key,value):
        if key not in {'experiment_enabled'}:raise ValueError('Cấu hình không được hỗ trợ.')
        if str(value) not in {'0','1'}:raise ValueError('Chế độ thử nghiệm phải là 0 hoặc 1.')
        with self.connection() as db:db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)',(key,str(value)))
    def seed_sample(self,catalog):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM settings WHERE key="inventory_source"').fetchone():return
            # Synthetic commercial values, explicitly labeled in every application view.
            for j,row in catalog.iterrows():
                if row['group']=='Chưa phân nhóm':continue
                db.execute('INSERT INTO inventory VALUES (?,?,?,?)',(str(row.item_id),12+int(j)%8,99000+(int(j)%17)*20000,1))
            db.execute('INSERT INTO settings VALUES ("inventory_source","sample")')
            db.execute('INSERT INTO settings VALUES ("inventory_revision","1")')
    def inventory(self):
        with self.connection() as db:return pd.read_sql_query('SELECT * FROM inventory ORDER BY item_id',db)
    def import_inventory(self,frame,catalog_ids):
        data=validate_inventory(frame,catalog_ids)
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            # Snapshot import: omitted SKUs are disabled, never left sellable by accident.
            db.execute('UPDATE inventory SET active=0')
            db.executemany('INSERT INTO inventory VALUES (?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET stock=excluded.stock,price=excluded.price,active=excluded.active',
                           [(str(r.item_id),int(r.stock),int(r.price),int(r.active)) for r in data.itertuples()])
            db.execute('INSERT OR REPLACE INTO settings VALUES ("inventory_source","operator_csv")')
            self.bump(db)
        return len(data)
    @staticmethod
    def bump(db):
        db.execute('INSERT INTO settings VALUES ("inventory_revision","1") ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1')
    def variant(self,visitor):
        if self.setting('experiment_enabled','0')!='1':return 'personalized'
        return 'control' if int(hashlib.sha256(visitor.encode()).hexdigest()[:8],16)%2==0 else 'treatment'
    def expose(self,visitor,variant,route,item_ids,latency_ms):
        request=uuid.uuid4().hex;now=self.now()
        with self.connection() as db:
            db.execute('INSERT INTO requests VALUES (?,?,?,?,?,?)',(request,visitor,variant,route,now,float(latency_ms)))
            db.executemany('INSERT INTO events(request_id,visitor,item_id,event,variant,created_at) VALUES (?,?,?,?,?,?)',
                           [(request,visitor,str(i),'impression',variant,now) for i in item_ids])
        return request
    @staticmethod
    def action_in(db,visitor,request,item,event,now):
        row=db.execute('SELECT variant FROM events WHERE visitor=? AND request_id=? AND item_id=? AND event="impression"',(visitor,request,item)).fetchone()
        if row is None:raise ValueError('Sự kiện không thuộc danh sách gợi ý đã hiển thị cho phiên này.')
        db.execute('INSERT OR IGNORE INTO events(request_id,visitor,item_id,event,variant,created_at) VALUES (?,?,?,?,?,?)',(request,visitor,item,event,row['variant'],now))
    def action(self,visitor,request,item,event):
        if event not in {'click','cart'}:raise ValueError('Loại sự kiện không hợp lệ.')
        with self.connection() as db:self.action_in(db,visitor,request,str(item),event,self.now())
    def checkout(self,visitor,cart,checkout_key):
        if not cart:raise ValueError('Giỏ hàng đang trống.')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            existing=db.execute('SELECT id FROM orders WHERE checkout_key=? AND visitor=?',(checkout_key,visitor)).fetchone()
            if existing:return existing['id']
            lines=[];total=0
            for item,entry in cart.items():
                q=entry['quantity']
                if isinstance(q,bool) or not isinstance(q,int) or q<=0:raise ValueError('Số lượng phải là số nguyên dương.')
                row=db.execute('SELECT * FROM inventory WHERE item_id=?',(item,)).fetchone()
                if row is None or not row['active'] or row['stock']<q:raise ValueError(f'{item} không còn đủ hàng; giỏ chưa được xác nhận.')
                self.action_in(db,visitor,entry['request_id'],item,'purchase',self.now())
                total+=q*row['price'];lines.append((item,q,row['price']))
            order='DEMO-'+uuid.uuid4().hex[:10].upper();now=self.now()
            db.execute('INSERT INTO orders VALUES (?,?,?,?,?)',(order,visitor,total,now,checkout_key))
            for item,q,price in lines:
                db.execute('UPDATE inventory SET stock=stock-? WHERE item_id=?',(q,item))
                db.execute('INSERT INTO order_items VALUES (?,?,?,?)',(order,item,q,price))
            self.bump(db)
            return order
    def tables(self):
        with self.connection() as db:
            return {name:pd.read_sql_query(f'SELECT * FROM {name}',db) for name in ['requests','events','orders','order_items']}


def recommend(catalog,arrays,profiles,profile,seed_items,inventory,variant,group='Tất cả',cart_ids=(),limit=9):
    ids=catalog.item_id.to_numpy();mapping={i:j for j,i in enumerate(ids)}
    history=next(p['history'] for p in profiles if p['profile']==profile) if profile!='Khách mới' else []
    if variant=='control':scores=arrays['popularity'][0].copy();route='popularity-control-v1'
    elif seed_items:
        js=[mapping[i] for i in seed_items if i in mapping]
        scores=scale(arrays['similarity'][js].mean(0)) if js else arrays['popularity'][0].copy()
        route='content-onboarding-v1'
    elif profile!='Khách mới':
        u=next(j for j,p in enumerate(profiles) if p['profile']==profile)
        history=profiles[u]['history'];scores=arrays['h3'][u].copy();route='validated-ranking-v1'
    else:scores=arrays['popularity'][0].copy();route='popularity-fallback-v1';history=[]
    available=set(inventory.loc[(inventory.active==1)&(inventory.stock>0)&(inventory.price>0),'item_id'])
    if group!='Tất cả':available &= set(catalog.loc[catalog['group']==group,'item_id'])
    excluded=(set(ids)-available)|set(cart_ids)|set(seed_items)|{ids[j] for j in history}
    ranked=diversify(scores,arrays['similarity'],ids,limit,.15,excluded)
    result=catalog.iloc[ranked].merge(inventory,on='item_id',how='left',validate='one_to_one')
    return result,route


def funnel(tables):
    events=tables['events'];requests=tables['requests'];rows=[]
    for variant in sorted(requests.variant.unique()) if len(requests) else []:
        ev=events[events.variant==variant];rq=requests[requests.variant==variant]
        impressions=int((ev.event=='impression').sum());clicks=int((ev.event=='click').sum())
        eligible=ev.loc[ev.event=='impression','visitor'].nunique();buyers=ev.loc[ev.event=='purchase','visitor'].nunique()
        rows.append({'variant':variant,'requests':len(rq),'impressions':impressions,'clicks':clicks,
                     'add_to_cart':int((ev.event=='cart').sum()),'purchase_items':int((ev.event=='purchase').sum()),
                     'eligible_sessions':eligible,'converting_sessions':buyers,'CTR':clicks/impressions if impressions else 0,
                     'session_conversion':buyers/eligible if eligible else 0,
                     'ranking_p95_ms':float(rq.latency_ms.quantile(.95))})
    return pd.DataFrame(rows)
