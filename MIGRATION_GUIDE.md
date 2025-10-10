# Stock Batch System Migration Guide

## Overview
This guide provides step-by-step instructions for safely migrating your existing inventory management system to the new stock batch system. The migration preserves all existing data while adding new batch tracking capabilities.

## Pre-Migration Checklist

### 1. Backup Your Database
```bash
# Create a full database backup before proceeding
pg_dump -h your_host -U your_user -d your_database > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Verify Current System State
- Ensure all pending transactions are completed
- Check that no critical operations are running
- Verify database connectivity

### 3. Dependencies Check
- Node.js version compatibility
- All npm packages are up to date
- Database permissions are sufficient

## Migration Steps

### Step 1: Generate and Apply Schema Changes
```bash
pnpm drizzle:push
```

### Step 2: Execute Data Migration Script
```bash
# Connect to your PostgreSQL database and execute the migration script
psql -h your_host -U your_user -d your_database -f migration-script.sql
```

### Step 3: Verify Migration Success
After running the migration script, verify that:
- All stock entries have `stock_batch_id` values
- Unit conversions exist for all product-unit combinations
- No data was lost during migration

```sql
-- Verification queries
SELECT COUNT(*) as total_stock FROM stock;
SELECT COUNT(*) as stock_with_batches FROM stock WHERE stock_batch_id IS NOT NULL;
SELECT COUNT(*) as total_batches FROM stock_batch;
SELECT COUNT(*) as total_conversions FROM unit_conversion;
```

## New Features Available After Migration

### 1. Stock Batch Management
- **Batch Creation**: New stock deliveries automatically create batches
- **FIFO Processing**: Sales are processed using First-In-First-Out logic
- **Batch Tracking**: Full traceability of stock from production to sale

### 2. Unit Conversion System
- **Flexible Units**: Products can have multiple units with conversion factors
- **Automatic Conversion**: System handles unit conversions during sales
- **Proportional Updates**: Changes in one unit automatically update related units

### 3. Enhanced Services

#### StockBatchService
- `addNewStockBatch()` - Create new batches with multiple units
- `processSaleByStockId()` - Process sales for specific stock entries
- `processSaleByBatchAndUnit()` - Process sales using FIFO logic
- `getAvailableStockForProduct()` - Get available stock across all batches

#### Updated ProductService
- `createProductWithUnits()` - Create products with unit conversions
- `updateProductWithUnits()` - Update products and their unit relationships
- `getProductUnitConversions()` - Retrieve unit conversion information

#### Updated StockService
- `getStocksWithBatch()` - Get stock information including batch details
- `getStocksByBatchId()` - Retrieve all stocks in a specific batch
- `checkStockAvailability()` - Verify stock availability

#### Updated DeliveryHistoryService
- Automatically creates batches when deliveries are completed
- Groups stock by product and maintains for efficient batch creation
- Maintains backward compatibility with existing delivery processes

## Data Preservation Guarantees

### What's Preserved
- ✅ All existing stock quantities and prices
- ✅ All product and unit relationships
- ✅ All delivery history records
- ✅ All customer and sales data
- ✅ All user permissions and roles

### What's Added
- ✅ Stock batch tracking for all existing stock
- ✅ Unit conversion factors (default: 1.0)
- ✅ Batch numbers for legacy stock (format: LEGACY-{productId}-{maintainsId})
- ✅ Production dates based on stock creation dates

### Default Values Applied
- **Unit Conversions**: All existing product-unit combinations get conversion factor = 1.0
- **Batch Numbers**: Legacy stock gets batch numbers in format "LEGACY-{productId}-{maintainsId}"
- **Production Dates**: Set to the earliest stock creation date for each product-maintains combination

## Rollback Plan

If issues arise during migration:

### 1. Restore from Backup
```bash
# Stop the application
# Restore the database backup
psql -h your_host -U your_user -d your_database < backup_YYYYMMDD_HHMMSS.sql
```

### 2. Revert Code Changes
```bash
# Checkout the previous version
git checkout previous_stable_version
npm install
npm run build
```

## Post-Migration Testing

### 1. Functional Tests
- Create new products with multiple units
- Process deliveries and verify batch creation
- Execute sales and verify FIFO processing
- Test unit conversions

### 2. Data Integrity Tests
```sql
-- Verify all stock has batches
SELECT COUNT(*) FROM stock WHERE stock_batch_id IS NULL; -- Should be 0

-- Verify unit conversions exist
SELECT p.name, u.name, uc.conversion_factor 
FROM unit_conversion uc
JOIN product p ON uc.product_id = p.id
JOIN units u ON uc.unit_id = u.id
ORDER BY p.name, u.name;

-- Verify batch integrity
SELECT sb.batch_number, COUNT(s.id) as stock_count
FROM stock_batch sb
LEFT JOIN stock s ON sb.id = s.stock_batch_id
GROUP BY sb.id, sb.batch_number
ORDER BY sb.created_at;
```

### 3. Performance Tests
- Test stock queries with large datasets
- Verify index performance
- Monitor query execution times

## Troubleshooting

### Common Issues

#### Issue: Migration Script Fails
**Solution**: Check database permissions and ensure all foreign key constraints are satisfied.

#### Issue: Some Stock Entries Missing Batch IDs
**Solution**: Run the verification query and manually link orphaned stock:
```sql
-- Find orphaned stock
SELECT * FROM stock WHERE stock_batch_id IS NULL;

-- Create batch and link (adjust values as needed)
INSERT INTO stock_batch (product_id, maintains_id, batch_number, production_date)
VALUES ('product_id', 'maintains_id', 'MANUAL-BATCH-' || gen_random_uuid(), now());
```

#### Issue: Unit Conversions Missing
**Solution**: Add missing conversions:
```sql
INSERT INTO unit_conversion (product_id, unit_id, conversion_factor)
SELECT uip.product_id, uip.unit_id, 1.0
FROM unit_in_product uip
WHERE NOT EXISTS (
    SELECT 1 FROM unit_conversion uc 
    WHERE uc.product_id = uip.product_id AND uc.unit_id = uip.unit_id
);
```

## Support

For issues during migration:
1. Check the migration logs for specific error messages
2. Verify database connectivity and permissions
3. Ensure all prerequisites are met
4. Contact the development team with specific error details

## Migration Checklist

- [ ] Database backup created
- [ ] Current system state verified
- [ ] Dependencies checked
- [ ] Schema migration applied (`npm run drizzle:migrate`)
- [ ] Data migration script executed
- [ ] Migration success verified
- [ ] Functional tests passed
- [ ] Data integrity tests passed
- [ ] Performance tests completed
- [ ] Application restarted
- [ ] Production monitoring enabled

## Conclusion

The stock batch system migration is designed to be safe and preserve all existing data. The migration script includes comprehensive verification steps and creates appropriate default values for new fields. After successful migration, your system will have enhanced batch tracking capabilities while maintaining full backward compatibility.