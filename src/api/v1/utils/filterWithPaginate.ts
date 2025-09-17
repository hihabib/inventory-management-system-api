// @ts-nocheck
import { and, eq, inArray, SQL, sql } from 'drizzle-orm';
import { alias, PgTable } from 'drizzle-orm/pg-core';
import { db } from '../drizzle/db';
import { Request } from 'express';

export type PaginationOptions = {
    page?: number;
    limit?: number;
};

export type FilterOptions = {
    [key: string]: any[];
};

export type JoinConfig = {
    table: PgTable;
    alias: string;
    condition: SQL; // Direct SQL condition
    type?: 'left' | 'inner' | 'right'; // Default: left
};

export type QueryOptions = {
    pagination?: PaginationOptions;
    filter?: FilterOptions;
    joins?: JoinConfig[];
    where?: SQL | SQL[];
    select?: Record<string, any>; // Custom selection fields
    orderBy?: SQL | SQL[]; // Custom ordering
    groupBy?: SQL | SQL[] | any; // Group by columns
};

/**
 * Enhanced filtering and pagination with support for complex relationships
 * 
 * @param table - The main Drizzle table to query
 * @param options - Query options including pagination, filters, joins, and conditions
 * @examples Basic Usage (selects all columns from main table):
 * const result = await filterWithPaginate(userTable, {
        filter: { status: ['active'] },
        pagination: { page: 1, limit: 10 }
    });
 * @examples With Custom Selection:
    const result = await filterWithPaginate(userTable, {
        select: {
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
            roleName: roleTable.name // Assuming roleTable is joined
        },
        joins: [
            {
                table: roleTable,
                alias: 'role',
                condition: eq(userTable.roleId, roleTable.id)
            }
        ]
    });
 * @example: With Complex Filtering and Joins:
    const result = await filterWithPaginate(userTable, {
        filter: { 
            'role.name': ['Admin', 'Manager'],
            'department.name': ['Engineering']
        },
        joins: [
            {
                table: roleTable,
                alias: 'role',
                condition: eq(userTable.roleId, roleTable.id)
            },
            {
                table: departmentTable,
                alias: 'department',
                condition: eq(userTable.departmentId, departmentTable.id)
            }
        ],
        orderBy: [desc(userTable.createdAt)]
    });
 * @returns Object containing the list of results and pagination metadata
 */
export async function filterWithPaginate<T extends PgTable>(
    table: T,
    options: QueryOptions = {}
) {
    const {
        pagination = { page: 1, limit: 10 },
        filter = {},
        joins = [],
        where: additionalWhere,
        select,
        orderBy,
        groupBy
    } = options;

    const { page = 1, limit = 10 } = pagination;
    const offset = (page - 1) * limit;

    // Build WHERE clause for filters
    const whereConditions: SQL[] = [];

    // Create a map of table references for filtering
    const tableRefs: Record<string, PgTable> = {};

    // Add main table with a default alias
    tableRefs['main'] = table;

    // Process joins to create table references
    for (const join of joins) {
        tableRefs[join.alias] = join.table;
    }

    // Process direct filters and relationship filters
    for (const [column, values] of Object.entries(filter)) {
        if (values.length === 0) continue;

        if (column.includes('.')) {
            // Relationship filter (e.g., 'role.name')
            const [aliasName, columnName] = column.split('.');
            const tableRef = tableRefs[aliasName];

            if (!tableRef) {
                console.warn(`Table reference not found for: ${aliasName}`);
                continue;
            }

            const tableColumn = tableRef[columnName as keyof typeof tableRef];
            if (!tableColumn) {
                console.warn(`Column not found: ${columnName} in table ${aliasName}`);
                continue;
            }

            if (values.length === 1) {
                whereConditions.push(eq(tableColumn, values[0]));
            } else {
                whereConditions.push(inArray(tableColumn, values));
            }
        } else {
            // Direct column filter
            const tableColumn = table[column as keyof typeof table];
            if (!tableColumn) {
                console.warn(`Column not found: ${column} in the main table`);
                continue;
            }

            if (values.length === 1) {
                whereConditions.push(eq(tableColumn, values[0]));
            } else {
                whereConditions.push(inArray(tableColumn, values));
            }
        }
    }

    // Add additional WHERE conditions
    if (additionalWhere) {
        if (Array.isArray(additionalWhere)) {
            whereConditions.push(...additionalWhere);
        } else {
            whereConditions.push(additionalWhere);
        }
    }

    // Build the base query
    let query;
    if (select) {
        // Use custom selection if provided
        query = db.select(select).from(table);
    } else {
        // Select all columns from main table by default
        query = db.select().from(table);
    }

    // Apply joins
    for (const join of joins) {
        const joinType = join.type || 'left';
        const joinMethod = joinType === 'inner' ? 'innerJoin' :
            joinType === 'right' ? 'rightJoin' : 'leftJoin';

        // Apply the join with the table and condition
        // @ts-ignore - Dynamic method call
        query = query[joinMethod](join.table, join.condition);
    }

    // Apply WHERE conditions
    if (whereConditions.length > 0) {
        query = query.where(and(...whereConditions));
    }

    // Apply GROUP BY if provided
    if (groupBy) {
        if (Array.isArray(groupBy)) {
            // @ts-ignore - Dynamic grouping
            query = query.groupBy(...groupBy);
        } else {
            // @ts-ignore - Dynamic grouping
            query = query.groupBy(groupBy);
        }
    }

    // Apply ORDER BY if provided
    if (orderBy) {
        if (Array.isArray(orderBy)) {
            // @ts-ignore - Dynamic ordering
            query = query.orderBy(...orderBy);
        } else {
            // @ts-ignore - Dynamic ordering
            query = query.orderBy(orderBy);
        }
    }

    // Get total count with same joins and conditions
    let countQuery = db.select({
        count: sql<string>`count(distinct ${table}.id)`
    }).from(table);

    // Apply same joins to count query
    for (const join of joins) {
        const joinType = join.type || 'left';
        const joinMethod = joinType === 'inner' ? 'innerJoin' :
            joinType === 'right' ? 'rightJoin' : 'leftJoin';

        // @ts-ignore
        countQuery = countQuery[joinMethod](join.table, join.condition);
    }

    if (whereConditions.length > 0) {
        countQuery = countQuery.where(and(...whereConditions));
    }

    const [totalCountResult] = await countQuery;
    const totalCount = Number(totalCountResult.count);

    // Get paginated data
    const data = await query.limit(limit).offset(offset);

    return {
        list: data,
        pagination: {
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
            totalCount,
        },
    };
}


export function getFilterAndPaginationFromRequest(req: Request): {
    pagination: PaginationOptions;
    filter: FilterOptions;
} {
    const pagination: PaginationOptions = {};
    const filter: FilterOptions = {};

    if (req.query?.page) {
        pagination.page = Number(req.query.page);
    }
    if (req.query?.limit) {
        pagination.limit = Number(req.query.limit);
    }

    for (const key in req.query) {
        if (key !== 'page' && key !== 'limit') {
            filter[key] = Array.isArray(req.query[key])
                ? req.query[key] as any[]
                : [req.query[key]];
        }
    }

    return { pagination, filter };
}