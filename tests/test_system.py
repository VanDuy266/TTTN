import json, unittest
from pathlib import Path
import numpy as np
import pandas as pd
from streamlit.testing.v1 import AppTest
from src.ranking import metric, topk, scale, diversify
ROOT=Path(__file__).resolve().parents[1]

class EvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog=pd.read_csv(ROOT/'artifacts/catalog.csv')
        cls.data=dict(np.load(ROOT/'artifacts/serving.npz',allow_pickle=False))
        cls.profiles=json.loads((ROOT/'artifacts/profiles.json').read_text())

    def test_metrics_and_tie_breaks(self):
        self.assertEqual(metric([3,2,1],np.array(['a','b','c']),'a'),(1,1.))
        self.assertEqual(metric([3,2,1],np.array(['a','b','c']),'c',k=2),(0,0.))
        self.assertEqual(topk([1,1],['b','a']),[1,0])
        self.assertEqual(topk([1,2],['a','b'],excluded={'b'}),[0])
        scaled=scale([-1e6,-1e6,-10,-9.999,50])
        self.assertTrue(scaled[1]<scaled[2]<scaled[3]<scaled[4])

    def test_serving_filters(self):
        scores=[1.,.9,.8];ids=['a','b','c']
        result=diversify(scores,np.eye(3),ids,3,.2,{'a'})
        self.assertEqual(set(result),{1,2})

    def test_recompute_published_evidence(self):
        metrics=pd.read_csv(ROOT/'artifacts/metrics.csv')
        names={'Popularity':'popularity','Content TF-IDF':'content','Graph branch':'graph','H1 GRU':'h1','H2 Graph + Text':'h2','H3 Hybrid':'h3'}
        ids=self.catalog.item_id.to_numpy()
        for name,key in names.items():
            hits=[];ndcgs=[]
            for u,p in enumerate(self.profiles):
                candidates=np.array(p['candidates']);self.assertEqual(len(set(candidates)),len(candidates))
                self.assertIn(p['target'],candidates)
                h,n=metric(self.data[key][u,candidates],ids[candidates],ids[p['target']])
                hits.append(h);ndcgs.append(n)
            row=metrics[(metrics.model==name)&(metrics.split=='test')&(metrics.cohort=='all')].iloc[0]
            self.assertAlmostEqual(np.mean(hits),row['Recall@10'],places=10)
            self.assertAlmostEqual(np.mean(ndcgs),row['NDCG@10'],places=10)

    def test_training_temporal_boundary(self):
        audit=json.loads((ROOT/'artifacts/audit.json').read_text())
        self.assertGreater(audit['excluded_ambiguous_train_rows'],0)
        data=ROOT/'data'
        if not (data/'train.csv').exists():self.skipTest('Raw data intentionally omitted from deployment')
        tr=pd.read_csv(data/'train.csv');va=pd.read_csv(data/'val.csv').set_index('user_id').timestamp
        selected=tr[tr.timestamp<tr.user_id.map(va)]
        self.assertEqual(len(selected),audit['train_rows'])

class AppTests(unittest.TestCase):
    def test_customer_order_and_operations(self):
        import tempfile, os
        with tempfile.TemporaryDirectory() as directory:
            os.environ['RETAIL_DB_PATH']=str(Path(directory)/'retail.sqlite')
            at=AppTest.from_file(str(ROOT/'app.py'),default_timeout=40).run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            self.assertTrue(any(x.value=='Gợi ý cho bạn' for x in at.subheader))
            add=next(b for b in at.button if b.label=='Thêm giỏ')
            add.click().run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            checkout=next(b for b in at.button if b.label=='Tạo đơn thử nghiệm')
            self.assertFalse(checkout.disabled);checkout.click().run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            self.assertTrue(any('DEMO-' in x.value for x in at.success))
            at.radio(key='workspace').set_value('Điều hành cửa hàng').run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            self.assertTrue(any(x.label=='Đơn thử đã tạo' and x.value=='1' for x in at.metric))
            at.radio(key='workspace').set_value('Kiểm chứng & tích hợp').run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            at.radio(key='evaluation_space').set_value('100 ứng viên cố định').run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            at.radio(key='workspace').set_value('Cửa hàng trải nghiệm').run()
            at.selectbox(key='profile').set_value('KH-0020').run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            from src.business import product_group
            catalog=pd.read_csv(ROOT/'artifacts/catalog.csv')
            selected=catalog[catalog.title.map(product_group)!='Chưa phân nhóm'].item_id.iloc[0]
            at.multiselect(key='needs').set_value([selected]).run()
            self.assertEqual(len(at.exception),0,str(at.exception))
            os.environ['RETAIL_ADMIN_PASSWORD']='fixture-admin-only'
            try:
                at.radio(key='workspace').set_value('Điều hành cửa hàng').run()
                self.assertEqual(len(at.metric),0)
                at.text_input(key='admin_password').set_value('wrong').run()
                self.assertEqual(len(at.metric),0)
                at.text_input(key='admin_password').set_value('fixture-admin-only').run()
                self.assertEqual(len(at.exception),0,str(at.exception))
                self.assertTrue(any(x.label=='Đơn thử đã tạo' for x in at.metric))
            finally:
                os.environ.pop('RETAIL_ADMIN_PASSWORD',None)
            os.environ.pop('RETAIL_DB_PATH',None)

if __name__=='__main__':unittest.main()
