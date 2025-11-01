import { SaleService } from './src/api/v1/service/sale.service';

async function testStockFix() {
    console.log('=== Testing Stock Filtering Fix ===\n');
    
    const testMaintainsId = '5cf2c18d-8738-4d95-ad56-edeeab190fba';
    const testDate = new Date('2025-10-29T18:00:00.000Z'); // User's input date
    
    console.log('Test Parameters:');
    console.log(`- maintains_id: ${testMaintainsId}`);
    console.log(`- input date: ${testDate.toISOString()}`);
    console.log(`- input date (Dhaka): ${testDate.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}\n`);
    
    try {
        console.log('Calling SaleService.getDailyReportData...\n');
        
        const result = await SaleService.getDailyReportData(testDate.toISOString(), testMaintainsId);
        
        console.log(`Total products returned: ${result.length}\n`);
        
        // Find the specific product we're testing
        const targetProduct = result.find(product => 
            product.productId === 'b8e4b71e-f42c-4617-991a-79c673151a82' && 
            product.productName === 'Ghee 500 gm'
        );
        
        if (targetProduct) {
            console.log('=== Target Product Found ===');
            console.log(`Product Name: ${targetProduct.productName}`);
            console.log(`Product ID: ${targetProduct.productId}`);
            console.log(`Previous Stock Quantity: ${targetProduct.previousStockQuantity}`);
            console.log(`Previous Stock Total Price: ${targetProduct.previousStockTotalPrice}`);
            console.log(`Main Unit Price: ${targetProduct.mainUnitPrice}`);
            console.log(`SKU: ${targetProduct.sku}\n`);
            
            // Verify the fix
            if (targetProduct.previousStockQuantity === 5) {
                console.log('✅ SUCCESS: previousStockQuantity is now 5 (expected value)');
                console.log('✅ The stock filtering fix is working correctly!');
            } else {
                console.log(`❌ FAILED: previousStockQuantity is ${targetProduct.previousStockQuantity}, expected 5`);
                console.log('❌ The fix did not work as expected.');
            }
        } else {
            console.log('❌ ERROR: Target product "Ghee 500 gm" not found in results');
        }
        
        // Show a few other products for context
        console.log('\n=== Other Products (first 5) ===');
        result.slice(0, 5).forEach((product, index) => {
            console.log(`${index + 1}. ${product.productName} (SKU: ${product.sku})`);
            console.log(`   Previous Stock: ${product.previousStockQuantity}, Price: ${product.previousStockTotalPrice}`);
        });
        
    } catch (error) {
        console.error('Error testing stock fix:', error);
    }
}

testStockFix().catch(console.error);