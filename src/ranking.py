"""Shared deterministic ranking, metrics, and safe serving filters."""
import numpy as np
from scipy.stats import rankdata


def scale(scores):
    scores = np.asarray(scores, dtype=float)
    ranks = rankdata(scores, method='average')
    return (ranks - ranks.min()) / max(float(ranks.max() - ranks.min()), 1.)


def topk(scores, item_ids, k=10, excluded=()):
    excluded = set(excluded)
    valid = [j for j, i in enumerate(item_ids) if i not in excluded and np.isfinite(scores[j])]
    return sorted(valid, key=lambda j: (-float(scores[j]), str(item_ids[j])))[:k]


def metric(scores, ids, target, k=10):
    ranked = [ids[j] for j in topk(scores, ids, k)]
    hit = int(target in ranked)
    return hit, float(1 / np.log2(ranked.index(target) + 2)) if hit else 0.0


def diversify(scores, similarity, ids, k=10, strength=0.15, excluded=()):
    pool = topk(scores, ids, min(150, len(ids)), excluded)
    chosen = []
    while pool and len(chosen) < k:
        best = max(pool, key=lambda j: (float(scores[j]) - strength *
                   (max(float(similarity[j, x]) for x in chosen) if chosen else 0), str(ids[j])))
        chosen.append(best)
        pool.remove(best)
    return chosen
