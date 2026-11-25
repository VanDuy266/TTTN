import unittest
from uuid import uuid4

from fastapi.testclient import TestClient

from app import app


class RetailWebTests(unittest.TestCase):
    def test_store_order_events_inventory_and_session_isolation(self):
        with TestClient(app) as browser:
            other = TestClient(app)
            self.assertEqual(browser.get("/api/store/session").status_code, 200)
            result = browser.post("/api/store/recommendations", json={}).json()
            item = result["items"][0]
            self.assertGreater(item["stock"], 0)
            event = {"item_id": item["item_id"], "request_id": result["request_id"], "event": "cart"}
            self.assertEqual(browser.post("/api/store/events", json=event).status_code, 200)
            self.assertEqual(other.get("/api/store/session").status_code, 200)
            self.assertEqual(other.post("/api/store/events", json=event).status_code, 409)
            payload = {
                "checkout_key": str(uuid4()),
                "cart": {item["item_id"]: {"quantity": 1, "request_id": result["request_id"]}},
            }
            first = browser.post("/api/store/orders", json=payload)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json(), browser.post("/api/store/orders", json=payload).json())
            operations = browser.get("/api/store/operations").json()
            self.assertEqual(len(operations["orders"]), 1)
            self.assertEqual(operations["lines"][0]["stock"], item["stock"] - 1)
            self.assertEqual(operations["funnel"][0]["purchase_items"], 1)
            self.assertEqual(other.get("/api/store/operations").json()["orders"], [])

            csv = f'item_id,stock,price,active\n{item["item_id"]},0,159000,1'
            self.assertEqual(browser.post("/api/store/inventory", json={"csv": csv}).status_code, 200)
            self.assertEqual(browser.post("/api/store/recommendations", json={}).json()["items"], [])
            self.assertEqual(browser.post("/api/store/inventory", json={"csv": "item_id,stock,price,active\n"}).status_code, 422)
            self.assertGreater(other.get("/api/store/operations").json()["sellable"], 0)
