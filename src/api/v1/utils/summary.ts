// @ts-nocheck
import { and, eq, inArray, SQL, gte, lte } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../drizzle/db';
import { FilterOptions, JoinConfig } from './filterWithPaginate';

export async function getSummary<T extends PgTable>(
  table: T,
  options: { filter?: FilterOptions; joins?: JoinConfig[]; summarySelect: Record<string, any>; groupBy?: any; where?: SQL[] }
) {
  const { filter = {}, joins = [], summarySelect, groupBy, where = [] } = options;

  const whereConditions: SQL[] = [...where];
  const tableRefs: Record<string, PgTable> = {};
  tableRefs['main'] = table;
  for (const join of joins) {
    tableRefs[join.alias] = join.table;
  }

  for (const [column, values] of Object.entries(filter)) {
    if (values.length === 0) continue;

    if (column.includes('[') && column.includes(']')) {
      const match = column.match(/^(.+)\[(from|to)\]$/);
      if (match) {
        const [, fieldName, rangeType] = match;
        const dateValue = values[0];
        if (fieldName.includes('.')) {
          const [aliasName, columnName] = fieldName.split('.');
          const tableRef = tableRefs[aliasName];
          if (!tableRef) continue;
          const tableColumn = tableRef[columnName as keyof typeof tableRef] as any;
          if (!tableColumn) continue;
          if (rangeType === 'from') {
            whereConditions.push(gte(tableColumn, new Date(dateValue)) as SQL);
          } else if (rangeType === 'to') {
            whereConditions.push(lte(tableColumn, new Date(dateValue)) as SQL);
          }
        } else {
          const tableColumn = table[fieldName as keyof typeof table] as any;
          if (!tableColumn) continue;
          if (rangeType === 'from') {
            whereConditions.push(gte(tableColumn, new Date(dateValue)) as SQL);
          } else if (rangeType === 'to') {
            whereConditions.push(lte(tableColumn, new Date(dateValue)) as SQL);
          }
        }
        continue;
      }
    }

    if (column.includes('.')) {
      const [aliasName, columnName] = column.split('.');
      const tableRef = tableRefs[aliasName];
      if (!tableRef) continue;
      const tableColumn = tableRef[columnName as keyof typeof tableRef] as any;
      if (!tableColumn) continue;
      if (values.length === 1) {
        whereConditions.push(eq(tableColumn, values[0]) as SQL);
      } else {
        whereConditions.push(inArray(tableColumn, values) as SQL);
      }
    } else {
      const tableColumn = table[column as keyof typeof table] as any;
      if (!tableColumn) continue;
      if (values.length === 1) {
        whereConditions.push(eq(tableColumn, values[0]) as SQL);
      } else {
        whereConditions.push(inArray(tableColumn, values) as SQL);
      }
    }
  }

  let query: any = db.select(summarySelect).from(table);
  for (const join of joins) {
    const joinType = join.type || 'left';
    const joinMethod = joinType === 'inner' ? 'innerJoin' : joinType === 'right' ? 'rightJoin' : 'leftJoin';
    query = (query as any)[joinMethod](join.table, join.condition);
  }
  if (whereConditions.length > 0) {
    query = query.where(and(...whereConditions));
  }
  if (groupBy) {
    if (Array.isArray(groupBy)) {
      query = query.groupBy(...groupBy);
    } else {
      query = query.groupBy(groupBy);
    }
    const rows = await query;
    return rows ?? [];
  } else {
    const [row] = await query;
    return row ?? {};
  }
}