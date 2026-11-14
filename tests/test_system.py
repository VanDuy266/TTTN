import json, unittest
from pathlib import Path
import numpy as np
import pandas as pd
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

if __name__=='__main__':unittest.main()
