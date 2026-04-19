#!/usr/bin/env python3
"""Quick test script for the two APIs."""

import json
import urllib.request

API_BASE_URL = "http://localhost:8081"
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2MjBmYTQ1LTQyYjEtNGNkMi04OWVmLWNlYzM3OGEzODE5OCIsInVzZXJuYW1lIjoiYXRpZm1hbmFnZXIiLCJlbWFpbCI6ImF0aWZtYW5hZ2VyQGdtYWlsLmNvbSIsInJvbGVJZCI6ImYyY2RlZDM0LWZiMWMtNDM5ZS1iNGMzLTQ5OTk0NTc1NTAyMCIsImlhdCI6MTc3NjU1OTQ0NH0.bpi8ySykon_bW8ug1n1jNbAPOtFAH13QzFc7TD1u_MM"

def test_api_1():
    """Test POST to delivery-histories."""
    print("🧪 Testing API 1: POST /api/v1/delivery-histories")

    payload = [{
        "unitId": "c3a66d06-a6b9-4942-9d9b-5f4cffb5d1a8",
        "maintainsId": "60d1b6b0-c58f-4a91-a6b8-374480c99b6e",
        "productId": "1b12b930-9fba-4100-a3a2-33d6d0ef3d0c",
        "pricePerQuantity": 280,
        "sentQuantity": 2,
        "receivedQuantity": 0,
        "orderedQuantity": 0,
        "status": "Order-Shipped",
        "orderedUnit": "kg",
        "orderNote": "",
        "neededAt": "2026-04-19T00:00:00+06:00",
        "latestUnitPriceData": [{"unitId": "c3a66d06-a6b9-4942-9d9b-5f4cffb5d1a8", "pricePerQuantity": 280}]
    }]

    req = urllib.request.Request(
        f"{API_BASE_URL}/api/v1/delivery-histories",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {JWT_TOKEN}',
            'Content-Type': 'application/json'
        }
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.load(response)
            print(f"   ✅ Success! Response: {json.dumps(data, indent=2)[:300]}...")
            return True
    except urllib.error.HTTPError as e:
        print(f"   ❌ HTTP Error {e.code}: {e.read().decode('utf-8')[:500]}")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_api_2():
    """Test GET to production-house-stock."""
    print("🧪 Testing API 2: GET /api/v1/production-house-stock")

    req = urllib.request.Request(
        f"{API_BASE_URL}/api/v1/production-house-stock?page=1&limit=1000",
        headers={
            'Authorization': f'Bearer {JWT_TOKEN}',
            'Content-Type': 'application/json'
        }
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.load(response)
            print(f"   ✅ Success! Got {len(data.get('list', []))} records")
            return True
    except urllib.error.HTTPError as e:
        print(f"   ❌ HTTP Error {e.code}: {e.read().decode('utf-8')[:500]}")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("📡 Testing APIs (make sure server is running!)")
    print("=" * 60)

    api1_success = test_api_1()
    print()
    api2_success = test_api_2()

    print("\n" + "=" * 60)
    print("📊 Results")
    print("=" * 60)
    print(f"   API 1 (POST delivery-histories): {'✅ PASS' if api1_success else '❌ FAIL'}")
    print(f"   API 2 (GET production-house-stock): {'✅ PASS' if api2_success else '❌ FAIL'}")

    if api1_success and api2_success:
        print("\n🎉 All tests passed!")
    else:
        print("\n⚠️  Some tests failed")
