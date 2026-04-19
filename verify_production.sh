#!/bin/bash
# Test production APIs after migration

PROD_API="https://atif-agro.bo ssl.com/api"
TOKEN="your_production_token_here"

echo "Testing Production APIs..."
echo ""

# Test 1: GET production-house-stock
echo "1. Testing GET /production-house-stock"
curl -s -X GET "$PROD_API/v1/production-house-stock?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.success, .message'

echo ""
echo "2. Testing POST /delivery-histories"
curl -s -X POST "$PROD_API/v1/delivery-histories" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "unitId": "your_unit_id",
      "maintainsId": "your_maintains_id",
      "productId": "your_product_id",
      "pricePerQuantity": 280,
      "sentQuantity": 2,
      "receivedQuantity": 0,
      "orderedQuantity": 0,
      "status": "Order-Shipped",
      "orderedUnit": "kg",
      "orderNote": "",
      "neededAt": "2026-04-19T00:00:00+06:00"
    }
  ]' | jq '.success, .message'

echo ""
echo "Done! If you see 'true' for success, migration worked!"
