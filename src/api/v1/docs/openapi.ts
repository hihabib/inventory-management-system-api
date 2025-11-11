import swaggerJSDoc from 'swagger-jsdoc';

// Base Swagger/OpenAPI configuration
const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Inventory Management System API',
      version: '1.0.0',
      description:
        'Professional API documentation for the Inventory Management System.\n\nIncludes authentication, sales reports, expenses, products, stocks, customers, deliveries, payments and more. Most endpoints are protected via Bearer JWT.',
      contact: { name: 'API Support' },
    },
    servers: [
      { url: '/api/v1', description: 'API v1 base path' },
    ],
    tags: [
      { name: 'Auth', description: 'User authentication and profile' },
      { name: 'Users', description: 'User management' },
      { name: 'Expenses', description: 'Expense tracking and management' },
      { name: 'Sales', description: 'Sales operations and reports' },
      { name: 'Products', description: 'Product catalog and units' },
      { name: 'Stock', description: 'Stock and batches' },
      { name: 'DeliveryHistory', description: 'Delivery history records' },
      { name: 'Customers', description: 'Customer management' },
      { name: 'Payments', description: 'Payment processing' },
      { name: 'CustomerDue', description: 'Customer due records management' },
      { name: 'Dashboard', description: 'Summary metrics' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        // Common pagination result
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            totalPages: { type: 'integer', example: 3 },
            totalCount: { type: 'integer', example: 25 },
          },
        },
        // User
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
            fullName: { type: 'string' },
            roleId: { type: 'string', format: 'uuid' },
            maintainsId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        // Maintains
        Maintains: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['Outlet', 'Production'] },
            location: { type: 'string' },
            phone: { type: 'array', items: { type: 'number' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        // Expense
        ExpenseCreate: {
          type: 'object',
          required: ['userId', 'amount', 'description', 'date'],
          properties: {
            userId: { type: 'string', format: 'uuid', description: 'ID of the user who made the expense' },
            maintainsId: { type: 'string', format: 'uuid', nullable: true, description: 'Optional maintains reference' },
            amount: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$', example: '150.75', description: 'Decimal amount as string' },
            description: { type: 'string', example: 'Office supplies' },
            date: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
          },
        },
        Expense: {
          allOf: [
            { $ref: '#/components/schemas/ExpenseCreate' },
            {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        // Sales daily report
        SalesDailyReport: {
          type: 'object',
          properties: {
            totalSoldQuantity: { type: 'number', description: 'Total sold quantity (unit-specific rounding applied)' },
            totalSaleAmount: { type: 'number', description: 'Total sale amount in BDT' },
            mainUnitName: { type: 'string', description: 'Name of the main unit for the product' },
          },
        },
        // Money report
        MoneyReport: {
          type: 'object',
          properties: {
            totalOutgoingProductPrice: { type: 'number', description: 'Sum of quantityInMainUnit * mainUnitPrice for the day' },
            mdSir: { type: 'number', description: 'Discount total for MD Sir customer category' },
            atifAgroOffice: { type: 'number', description: 'Discount total for Atif Agro Office customer category' },
            discount: { type: 'number', description: 'Overall discount excluding MD Sir and Atif Agro Office' },
            dueSale: { type: 'number', description: 'Total due payments for the day' },
            cardSale: { type: 'number', description: 'Total card payments for the day' },
            cashSale: { type: 'number', description: 'Total cash payments for the day' },
            bkashSale: { type: 'number', description: 'Total bKash payments for the day' },
            nogodSale: { type: 'number', description: 'Total Nogod payments for the day' },
            sendForUse: { type: 'number', description: 'Total send-for-use amount for the day' },
            previousCash: { type: 'number', description: "Previous cash from maintains.stockCash before today's adjustments" },
            creditCollection: { type: 'number', description: 'Total collected customer due for the day' },
            expense: { type: 'number', description: 'Total expenses for the day (from expenses.date)' },
            totalCashBeforeSend: { type: 'number', description: 'cashSale + previousCash + creditCollection - expense' },
            sentToBank: { type: 'number', description: 'Total cash sent to bank for the day' },
            totalCashAfterSend: { type: 'number', description: 'totalCashBeforeSend - sentToBank (also saved to maintains.stockCash)' },
          },
        },
        // Cash Sending
        CashSendingCreate: {
          type: 'object',
          required: ['maintainsId', 'cashAmount', 'cashOf'],
          properties: {
            maintainsId: { type: 'string', format: 'uuid', description: 'Maintains UUID' },
            cashAmount: { type: 'number', minimum: 0.01, description: 'Positive amount' },
            cashOf: { type: 'string', format: 'date-time', example: '2025-10-26T18:00:00.000Z', description: 'UTC ISO datetime of the cash-of day' },
            note: { type: 'string', nullable: true },
          },
        },
        CashSending: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            maintainsId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            sendingTime: { type: 'string', format: 'date-time' },
            cashOf: { type: 'string', format: 'date-time' },
            note: { type: 'string' },
            cashAmount: { type: 'number' },
          },
        },
        // Cash Sending (with joined user and maintains)
        CashSendingDetail: {
          allOf: [
            { $ref: '#/components/schemas/CashSending' },
            {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                maintains: { $ref: '#/components/schemas/Maintains' },
              },
            },
          ],
        },
        CashSendingUpdate: {
          type: 'object',
          description: 'Fields to update on a cash-sending entry. All are optional.',
          properties: {
            maintainsId: { type: 'string', format: 'uuid', description: 'Maintains UUID' },
            cashAmount: { type: 'number', minimum: 0.01, description: 'Positive amount' },
            cashOf: { type: 'string', format: 'date-time', example: '2025-10-26T18:00:00.000Z', description: 'UTC ISO datetime of the cash-of day' },
            note: { type: 'string', nullable: true },
          },
        },

        // Customer Due
        CustomerDueCreate: {
          type: 'object',
          required: ['customerId', 'maintainsId', 'totalAmount', 'paidAmount'],
          properties: {
            customerId: { type: 'string', format: 'uuid', description: 'Customer UUID' },
            maintainsId: { type: 'string', format: 'uuid', description: 'Maintains UUID' },
            totalAmount: { type: 'number', minimum: 0, description: 'Total due amount (number with 2 decimals)' },
            paidAmount: { type: 'number', minimum: 0, description: 'Already paid amount (number with 2 decimals)' },
          },
          description: 'Creates a customer due record. "createdBy" is derived from JWT.',
        },
        CustomerDue: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            createdBy: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', format: 'uuid' },
            maintainsId: { type: 'string', format: 'uuid' },
            totalAmount: { type: 'number' },
            paidAmount: { type: 'number' },
          },
        },
        CustomerDueDetail: {
          allOf: [
            { $ref: '#/components/schemas/CustomerDue' },
            {
              type: 'object',
              properties: {
                // User (createdBy)
                username: { type: 'string' },
                fullname: { type: 'string' },
                // Customer details
                customerName: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                about: { type: 'string' },
                // Maintains details
                maintainsName: { type: 'string' },
                maintainsType: { type: 'string', enum: ['Outlet', 'Production'] },
                // Updates history
                updates: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/CustomerDueUpdateHistory' },
                  description: 'Chronological history of updates for this due record',
                },
              },
            },
          ],
        },
        CustomerDueUpdateHistory: {
          type: 'object',
          description: 'A single history entry recorded whenever the customer due record is updated.',
          properties: {
            id: { type: 'integer', description: 'Identity primary key of the history row' },
            createdAt: { type: 'string', format: 'date-time', description: 'Timestamp the history row was created' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Timestamp the history row was last updated' },
            customerDueId: { type: 'string', format: 'uuid', description: 'Reference to the customer due record' },
            updatedBy: { type: 'string', format: 'uuid', description: 'User ID who performed the update' },
            totalAmount: { type: 'number', description: 'Total amount after the update' },
            paidAmount: { type: 'number', description: 'Paid amount after the update' },
            collectedAmount: { type: 'number', description: 'Delta computed as new paidAmount minus previous paidAmount' },
          },
        },
        CustomerDueUpdate: {
          type: 'object',
          description: 'Fields to update on a customer due entry. All are optional.',
          properties: {
            customerId: { type: 'string', format: 'uuid', description: 'Customer UUID' },
            maintainsId: { type: 'string', format: 'uuid', description: 'Maintains UUID' },
            totalAmount: { type: 'number', minimum: 0, description: 'Total due amount (number with 2 decimals)' },
            paidAmount: { type: 'number', minimum: 0, description: 'Already paid amount (number with 2 decimals)' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      // Auth
      '/users/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          description: 'Creates a new user account with role and maintains assignment.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password', 'fullName', 'roleId', 'maintainsId'],
                  properties: {
                    username: { type: 'string' },
                    password: { type: 'string', format: 'password' },
                    fullName: { type: 'string' },
                    roleId: { type: 'string', format: 'uuid' },
                    maintainsId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User registered successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            400: { description: 'Validation error' },
          },
        },
      },
      '/users/signin': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in',
          description: 'Authenticates a user and returns a JWT token.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: { username: { type: 'string' }, password: { type: 'string', format: 'password' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Signed in successfully' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/users': {
        get: {
          tags: ['Users'],
          summary: 'List users',
          description: 'Lists users (protected). Supports pagination and filtering.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Page number' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Items per page' },
          ],
          responses: {
            200: { description: 'User list retrieved' },
          },
          security: [{ bearerAuth: [] }],
        },
      },
      '/users/profile': {
        get: {
          tags: ['Users'],
          summary: 'Get profile',
          description: 'Returns the authenticated user profile.',
          responses: { 200: { description: 'Profile data' } },
          security: [{ bearerAuth: [] }],
        },
      },

      // Sales
      '/sales': {
        get: {
          tags: ['Sales'],
          summary: 'List sales',
          description: 'Lists sales with pagination and filtering (protected).',
          responses: { 200: { description: 'Sales list' } },
          security: [{ bearerAuth: [] }],
        },
        post: {
          tags: ['Sales'],
          summary: 'Create sale',
          description: 'Creates a new sale with multi-batch products and payments (protected).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['maintainsId', 'products', 'paymentInfo', 'totalPriceWithDiscount'],
                  properties: {
                    maintainsId: { type: 'string', format: 'uuid' },
                    products: { type: 'array', items: { type: 'object' } },
                    paymentInfo: { type: 'array', items: { type: 'object' } },
                    totalPriceWithDiscount: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Sale created' }, 400: { description: 'Validation error' } },
          security: [{ bearerAuth: [] }],
        },
      },
      '/sales/{id}': {
        get: {
          tags: ['Sales'],
          summary: 'Get sale by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Sale found' }, 404: { description: 'Sale not found' } },
          security: [{ bearerAuth: [] }],
        },
      },

      // Expenses
      '/expenses': {
        get: {
          tags: ['Expenses'],
          summary: 'List expenses',
          description: 'Returns paginated list of expenses. Supports filtering via filterWithPaginate.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Page number' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Items per page' },
            { name: 'filter[user.id][]', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by user ID' },
            { name: 'filter[maintains.id][]', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by maintains ID' },
          ],
          responses: {
            200: {
              description: 'Expense list with pagination',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      list: { type: 'array', items: { $ref: '#/components/schemas/Expense' } },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                  },
                },
              },
            },
          },
          security: [{ bearerAuth: [] }],
        },
        post: {
          tags: ['Expenses'],
          summary: 'Create expense',
          description: 'Creates a new expense record. Amount must be a string to preserve decimal precision.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ExpenseCreate' } } },
          },
          responses: {
            201: { description: 'Expense created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Expense' } } } },
            400: { description: 'Validation error' },
          },
          security: [{ bearerAuth: [] }],
        },
      },
      '/expenses/{id}': {
        get: {
          tags: ['Expenses'],
          summary: 'Get expense by ID',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          responses: {
            200: { description: 'Expense found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Expense' } } } },
            404: { description: 'Expense not found' },
          },
          security: [{ bearerAuth: [] }],
        },
        put: {
          tags: ['Expenses'],
          summary: 'Update expense',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ExpenseCreate' } } },
          },
          responses: { 200: { description: 'Expense updated' }, 404: { description: 'Expense not found' } },
          security: [{ bearerAuth: [] }],
        },
        delete: {
          tags: ['Expenses'],
          summary: 'Delete expense',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          responses: { 200: { description: 'Expense deleted' }, 404: { description: 'Expense not found' } },
          security: [{ bearerAuth: [] }],
        },
      },

      // Sales
      '/sales/getDailyReportData': {
        get: {
          tags: ['Sales'],
          summary: 'Get daily report data',
          description:
            'Returns daily sales data for a given date and maintains ID. When `isDummy=true`, reduces totals by a percentage and applies unit-specific rounding.\n\nRounding rules: kg/other → 2 decimals; piece/box → floored to integer.',
          parameters: [
            { name: 'date', in: 'query', required: true, schema: { type: 'string' }, description: 'ISO date string (e.g., 2024-01-15)' },
            { name: 'maintains_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Maintains UUID' },
            { name: 'isDummy', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] }, description: 'Enable dummy reduction mode' },
            { name: 'reduceSalePercentage', in: 'query', required: false, schema: { type: 'number', minimum: 1, maximum: 100 }, description: 'Percentage to reduce totals (required when isDummy=true)' },
          ],
          responses: {
            200: { description: 'Daily report retrieved', content: { 'application/json': { schema: { $ref: '#/components/schemas/SalesDailyReport' } } } },
            400: { description: 'Validation error (UUID, isDummy, percentage)' },
            500: { description: 'Server error' },
          },
          security: [{ bearerAuth: [] }],
        },
      },
      '/sales/getMoneyReport': {
        get: {
          tags: ['Sales'],
          summary: 'Get money report',
          description:
            'Returns a financial summary for a given day and maintains outlet. Aggregates payments, discounts, expenses, previous cash, credit collection, and cash sending, then updates maintains.stockCash with totalCashAfterSend.',
          parameters: [
            { name: 'maintains_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Maintains UUID' },
            { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date-time' }, example: '2025-10-26T18:00:00.000Z', description: 'UTC ISO start-of-day (Dhaka local day in UTC)' },
          ],
          responses: {
            200: { description: 'Money report generated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MoneyReport' } } } },
            400: { description: 'Validation error (UUID or date format)' },
            500: { description: 'Server error' },
          },
          security: [{ bearerAuth: [] }],
        },
      },
      '/sales/cash-sending': {
        get: {
          tags: ['Sales'],
          summary: 'List cash sending entries',
          description: 'Returns a paginated list of cash-sending entries. Supports filtering via filterWithPaginate.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Page number' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Items per page' },
            { name: 'filter[user.id][]', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by user ID' },
            { name: 'filter[maintains.id][]', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by maintains ID' },
          ],
          responses: {
            200: {
              description: 'Cash sending list with pagination',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      list: { type: 'array', items: { $ref: '#/components/schemas/CashSendingDetail' } },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                  },
                },
              },
            },
          },
          security: [{ bearerAuth: [] }],
        },
        post: {
          tags: ['Sales'],
          summary: 'Record cash sending',
          description: 'Authenticated endpoint that records a cash sending entry. `userId` is derived from the JWT, not the request body.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CashSendingCreate' } } },
          },
          responses: {
            201: { description: 'Cash sending recorded', content: { 'application/json': { schema: { $ref: '#/components/schemas/CashSending' } } } },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
          },
          security: [{ bearerAuth: [] }],
        },
      },
      '/sales/cash-sending/{id}': {
        get: {
          tags: ['Sales'],
          summary: 'Get cash sending by ID',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          responses: {
            200: { description: 'Cash sending found', content: { 'application/json': { schema: { $ref: '#/components/schemas/CashSendingDetail' } } } },
            404: { description: 'Cash sending not found' },
          },
          security: [{ bearerAuth: [] }],
        },
        put: {
          tags: ['Sales'],
          summary: 'Update cash sending by ID',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CashSendingUpdate' },
              },
            },
          },
          responses: {
            200: { description: 'Cash sending updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/CashSendingDetail' } } } },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
            404: { description: 'Cash sending not found' },
          },
          security: [{ bearerAuth: [] }],
        },
      },

      // Customer Due
      '/customer-due': {
        get: {
          tags: ['CustomerDue'],
          summary: 'List customer dues',
          description: 'Returns paginated list of customer due records with their updates history. Supports filtering via filterWithPaginate and name search.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Page number' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Items per page' },
            { name: 'filter[user.id][]', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by creator user ID' },
            { name: 'filter[customer.id][]', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by customer ID' },
            { name: 'filter[maintains.id][]', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by maintains ID' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by customer name (case-insensitive, partial match)' },
            { name: 'customerName', in: 'query', schema: { type: 'string' }, description: 'Alias for search on customer name' },
          ],
          responses: {
            200: {
              description: 'Customer due list with pagination',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      list: { type: 'array', items: { $ref: '#/components/schemas/CustomerDueDetail' } },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                  },
                },
              },
            },
          },
          security: [{ bearerAuth: [] }],
        },
        post: {
          tags: ['CustomerDue'],
          summary: 'Create customer due',
          description: 'Creates a new customer due record. "createdBy" is derived from the JWT and not provided in the body.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerDueCreate' } } },
          },
          responses: {
            201: { description: 'Customer due created', content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerDue' } } } },
            400: { description: 'Validation error' },
          },
          security: [{ bearerAuth: [] }],
        },
      },
      '/customer-due/{id}': {
        get: {
          tags: ['CustomerDue'],
          summary: 'Get customer due by ID',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          responses: {
            200: { description: 'Customer due found with updates history', content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerDueDetail' } } } },
            404: { description: 'Customer due not found' },
          },
          security: [{ bearerAuth: [] }],
        },
        put: {
          tags: ['CustomerDue'],
          summary: 'Update customer due',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerDueUpdate' } } },
          },
          responses: { 200: { description: 'Customer due updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerDue' } } } }, 404: { description: 'Customer due not found' } },
          security: [{ bearerAuth: [] }],
        },
        delete: {
          tags: ['CustomerDue'],
          summary: 'Delete customer due',
          parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } ],
          responses: { 200: { description: 'Customer due deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerDue' } } } }, 404: { description: 'Customer due not found' } },
          security: [{ bearerAuth: [] }],
        },
      },

      // Stock routes
      '/stocks': {
        get: {
          tags: ['Stock'],
          summary: 'List stocks',
          responses: { 200: { description: 'Stocks list' } },
          security: [{ bearerAuth: [] }],
        },
        post: {
          tags: ['Stock'],
          summary: 'Create stock',
          responses: { 201: { description: 'Stock created' } },
          security: [{ bearerAuth: [] }],
        },
        put: {
          tags: ['Stock'],
          summary: 'Update stock',
          responses: { 200: { description: 'Stock updated' } },
          security: [{ bearerAuth: [] }],
        },
      },
      '/stocks/bulk': {
        post: {
          tags: ['Stock'],
          summary: 'Bulk create or update stock',
          responses: { 200: { description: 'Bulk upsert complete' } },
          security: [{ bearerAuth: [] }],
        },
      },
      '/stocks/bulk-add': {
        post: {
          tags: ['Stock'],
          summary: 'Bulk add stock quantities',
          responses: { 200: { description: 'Bulk add complete' } },
          security: [{ bearerAuth: [] }],
        },
      },
      '/stocks/with-batch': {
        get: {
          tags: ['Stock'],
          summary: 'Get stocks with batch info',
          responses: { 200: { description: 'Stocks with batch' } },
          security: [{ bearerAuth: [] }],
        },
      },
      '/stocks/batch/{batchId}': {
        get: {
          tags: ['Stock'],
          summary: 'Get stocks by batch ID',
          parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Stocks by batch' } },
          security: [{ bearerAuth: [] }],
        },
      },
      '/stocks/{id}/with-batch': {
        get: {
          tags: ['Stock'],
          summary: 'Get stock by ID with batch info',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Stock with batch' }, 404: { description: 'Not found' } },
          security: [{ bearerAuth: [] }],
        },
      },
      '/stocks/{id}': {
        delete: {
          tags: ['Stock'],
          summary: 'Delete stock',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } },
          security: [{ bearerAuth: [] }],
        },
      },

      // Stock batch routes
      '/stock-batches': {
        get: { tags: ['Stock'], summary: 'List stock batches', responses: { 200: { description: 'Batches list' } }, security: [{ bearerAuth: [] }] },
        post: { tags: ['Stock'], summary: 'Create stock batch', responses: { 201: { description: 'Batch created' } }, security: [{ bearerAuth: [] }] },
      },
      '/stock-batches/{id}': {
        get: { tags: ['Stock'], summary: 'Get batch by ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Batch found' }, 404: { description: 'Not found' } }, security: [{ bearerAuth: [] }] },
        put: { tags: ['Stock'], summary: 'Update batch', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Batch updated' } }, security: [{ bearerAuth: [] }] },
      },
      '/stock-batches/stock/{id}': {
        get: { tags: ['Stock'], summary: 'Get stock by ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Stock found' }, 404: { description: 'Not found' } }, security: [{ bearerAuth: [] }] },
        put: { tags: ['Stock'], summary: 'Update stock in batch', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Stock updated' } }, security: [{ bearerAuth: [] }] },
      },
      '/stock-batches/batch/{batchId}/stocks': {
        get: { tags: ['Stock'], summary: 'Get stocks by batch', parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Stocks in batch' } }, security: [{ bearerAuth: [] }] },
        put: { tags: ['Stock'], summary: 'Update all stocks in batch', parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Batch stocks updated' } }, security: [{ bearerAuth: [] }] },
      },
      '/stock-batches/batch/{batchId}/details': {
        get: { tags: ['Stock'], summary: 'Get batch details with stocks', parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Batch details' } }, security: [{ bearerAuth: [] }] },
      },
      '/stock-batches/process-sale/by-stock': {
        post: { tags: ['Stock'], summary: 'Process sale by stock ID', responses: { 200: { description: 'Sale processed' } }, security: [{ bearerAuth: [] }] },
      },
      '/stock-batches/process-sale/by-batch-unit/{batchId}': {
        post: { tags: ['Stock'], summary: 'Process sale by batch and unit', parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Sale processed' } }, security: [{ bearerAuth: [] }] },
      },
      '/stock-batches/product/{productId}/available-stock': {
        get: { tags: ['Stock'], summary: 'Get available stock for product', parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Available stock' } }, security: [{ bearerAuth: [] }] },
      },
    },
  },
  apis: [],
};

export const openapiSpec = swaggerJSDoc(options);