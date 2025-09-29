const { desc } = require('drizzle-orm');
const { deliveryHistoryTable } = require('./src/api/v1/drizzle/schema/deliveryHistory');
const { filterWithPaginate } = require('./src/api/v1/utils/filterWithPaginate');

async function testSorting() {
    console.log('Testing sorting functionality...');
    
    try {
        // Test the exact same call as in the service
        const result = await filterWithPaginate(deliveryHistoryTable, {
            pagination: { page: 1, limit: 5 },
            filter: {},
            orderBy: desc(deliveryHistoryTable.createdAt)
        });
        
        console.log('Result:', JSON.stringify(result, null, 2));
        
        // Check if the results are actually sorted
        if (result.list && result.list.length > 1) {
            console.log('\nChecking sort order:');
            for (let i = 0; i < result.list.length - 1; i++) {
                const current = new Date(result.list[i].createdAt);
                const next = new Date(result.list[i + 1].createdAt);
                console.log(`Item ${i}: ${current.toISOString()}`);
                console.log(`Item ${i + 1}: ${next.toISOString()}`);
                console.log(`Is descending: ${current >= next}`);
                console.log('---');
            }
        }
        
    } catch (error) {
        console.error('Error testing sorting:', error);
    }
}

testSorting();