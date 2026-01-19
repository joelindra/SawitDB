/**
 * StatsManager - Implements "Statistik Panen" (Harvest Statistics)
 * Provides insights into database health and performance
 */
class StatsManager {
    constructor(engine) {
        this.engine = engine;
        this.queryStats = new Map(); // query hash -> stats
        this.tableStats = new Map(); // table name -> stats
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Initialize stats system
     */
    init() {
        // Stats are tracked in memory only, no persistent storage needed
    }

    /**
     * Record a query execution
     * @param {string} query - Query string
     * @param {number} executionTime - Execution time in ms
     * @param {string} type - Query type (SELECT, INSERT, etc.)
     */
    recordQuery(query, executionTime, type) {
        const hash = this._hashQuery(query);

        if (!this.queryStats.has(hash)) {
            this.queryStats.set(hash, {
                query: query.substring(0, 100), // Store truncated query
                type: type,
                count: 0,
                totalTime: 0,
                avgTime: 0,
                minTime: Infinity,
                maxTime: 0
            });
        }

        const stats = this.queryStats.get(hash);
        stats.count++;
        stats.totalTime += executionTime;
        stats.avgTime = stats.totalTime / stats.count;
        stats.minTime = Math.min(stats.minTime, executionTime);
        stats.maxTime = Math.max(stats.maxTime, executionTime);
    }

    /**
     * Get table statistics
     * @param {string} tableName - Table name
     */
    getTableStats(tableName) {
        const entry = this.engine.tableManager.findTableEntry(tableName);

        if (!entry) {
            throw new Error(`Table '${tableName}' not found`);
        }

        // Get row count by scanning table
        const rows = this.engine.selectExecutor.execute({
            type: 'SELECT',
            table: tableName,
            cols: ['*']
        });

        const rowCount = rows ? rows.length : 0;
        const sizeBytes = JSON.stringify(rows).length;

        // Get index stats
        const indexes = this.engine.indexManager.listIndexes(tableName);

        return {
            table: tableName,
            row_count: rowCount,
            size_bytes: sizeBytes,
            size_kb: (sizeBytes / 1024).toFixed(2),
            indexes: indexes.length,
            index_details: indexes
        };
    }

    /**
     * Get all table statistics
     */
    getAllTableStats() {
        const stats = [];
        const tables = this.engine.tableManager.showTables();

        for (const tableName of tables) {
            try {
                stats.push(this.getTableStats(tableName));
            } catch (e) {
                console.error(`Failed to get stats for table '${tableName}':`, e.message);
            }
        }

        return stats;
    }

    /**
     * Get query performance statistics
     * @param {number} limit - Number of queries to return
     */
    getQueryStats(limit = 10) {
        const stats = Array.from(this.queryStats.values());

        // Sort by total time (slowest first)
        stats.sort((a, b) => b.totalTime - a.totalTime);

        return stats.slice(0, limit);
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        if (this.engine.pager && this.engine.pager.cache) {
            const cache = this.engine.pager.cache;
            return {
                size: cache.size,
                max_size: cache.maxSize || 'unlimited',
                hit_rate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
                ...this.cacheStats
            };
        }

        return this.cacheStats;
    }

    /**
     * Record cache hit
     */
    recordCacheHit() {
        this.cacheStats.hits++;
    }

    /**
     * Record cache miss
     */
    recordCacheMiss() {
        this.cacheStats.misses++;
    }

    /**
     * Record cache eviction
     */
    recordCacheEviction() {
        this.cacheStats.evictions++;
    }

    /**
     * Get database summary
     */
    getDatabaseSummary() {
        const tables = this.engine.tableManager.showTables();
        const tableCount = tables.length;

        let totalRows = 0;
        for (const tableName of tables) {
            try {
                const rows = this.engine.selectExecutor.execute({
                    type: 'SELECT',
                    table: tableName,
                    cols: ['*']
                });
                totalRows += rows ? rows.length : 0;
            } catch (e) {
                // Skip tables that can't be read
            }
        }

        return {
            database: this.engine.dbName || 'default',
            table_count: tableCount,
            total_rows: totalRows,
            cache_stats: this.getCacheStats(),
            query_count: this.queryStats.size
        };
    }

    /**
     * Reset statistics
     */
    reset() {
        this.queryStats.clear();
        this.tableStats.clear();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Hash a query string
     */
    _hashQuery(query) {
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }
}

module.exports = StatsManager;
