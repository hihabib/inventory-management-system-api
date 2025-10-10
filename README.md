# inventory-management-system-api

## API Documentation

### Stock Batch Management

#### Create Stock Batch with Manual Unit Pricing

**Endpoint:** `POST /api/v1/stock-batches`

**Description:** Creates a new stock batch with automatic quantity calculation based on main unit input and manual pricing for each unit.

**Business Logic:**
- **Quantity Auto-calculation:** Quantities for all units are automatically calculated based on the main unit quantity and unit conversion factors
- **Manual Unit Pricing:** Prices for each unit must be manually specified in the request
- **Flexible Sales Unit Reduction:** Stock can be reduced from any unit, with automatic proportional updates to all other units in the same batch

**Request Body:**
```json
{
  "productId": "string (required)",
  "maintainsId": "string (required)", 
  "batchNumber": "string (required)",
  "productionDate": "string (optional, ISO date)",
  "mainUnitQuantity": "number (required, positive)",
  "unitPrices": [
    {
      "unitId": "string (required)",
      "pricePerQuantity": "number (required, positive)"
    }
  ]
}
```

**Important Notes:**
- `unitPrices` must include prices for ALL units associated with the product
- Missing unit prices will result in a validation error
- Quantities are automatically calculated based on unit conversion factors
- All unit prices must be positive numbers

**Example Request:**
```json
{
  "productId": "00e0412b-c3ff-4c75-a731-d999c8dfcca4",
  "maintainsId": "b43ebab5-07a2-4ac7-9ffa-70451fa5809e",
  "batchNumber": "BATCH-001",
  "productionDate": "2024-01-15",
  "mainUnitQuantity": 5,
  "unitPrices": [
    {
      "unitId": "c3a66d06-a6b9-4942-9d9b-5f4cffb5d1a8",
      "pricePerQuantity": 200
    },
    {
      "unitId": "24366ae4-3186-4b66-b6e9-f1ec15bc9ec1", 
      "pricePerQuantity": 100
    },
    {
      "unitId": "adcdfb26-9cbf-47e7-88ac-30437daa3f2a",
      "pricePerQuantity": 2
    }
  ]
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Stock batch created successfully",
  "statusCode": 201,
  "data": {
    "batch": {
      "id": "31c60586-6a46-4ea2-940b-53c1639422e7",
      "productId": "00e0412b-c3ff-4c75-a731-d999c8dfcca4",
      "maintainsId": "b43ebab5-07a2-4ac7-9ffa-70451fa5809e",
      "batchNumber": "BATCH-001",
      "productionDate": "2024-01-15T00:00:00.000Z"
    },
    "stocks": [
      {
        "id": "b7020510-4803-4c95-bbc5-3e7787beb9cc",
        "unitId": "c3a66d06-a6b9-4942-9d9b-5f4cffb5d1a8",
        "pricePerQuantity": 200,
        "quantity": 5
      },
      {
        "id": "a4d6e78c-a36c-44e9-8eff-a5a572161b44", 
        "unitId": "24366ae4-3186-4b66-b6e9-f1ec15bc9ec1",
        "pricePerQuantity": 100,
        "quantity": 10
      },
      {
        "id": "89994d2e-8947-4afa-8268-de58b5f68803",
        "unitId": "adcdfb26-9cbf-47e7-88ac-30437daa3f2a", 
        "pricePerQuantity": 2,
        "quantity": 500
      }
    ]
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid input data or validation errors
- `500 Internal Server Error`: Missing unit prices or server errors