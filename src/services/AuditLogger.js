/**
 * AuditLogger - Implements "Buku Kas Desa" (Village Cash Book)
 * Provides tamper-evident logging of all data modifications
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuditLogger {
    constructor(dbPath, options = {}) {
        this.dbPath = dbPath;
        this.enabled = options.enabled !== false; // Enabled by default
        this.auditPath = dbPath.replace('.sawit', '.audit');
        this.stream = null;
    }

    /**
     * Initialize audit logger
     */
    init() {
        if (!this.enabled) return;

        try {
            // Open audit file in append mode
            this.stream = fs.createWriteStream(this.auditPath, { flags: 'a' });

            // Write header if file is new
            if (!fs.existsSync(this.auditPath) || fs.statSync(this.auditPath).size === 0) {
                this._writeHeader();
            }
        } catch (error) {
            console.error('Failed to initialize audit logger:', error.message);
            this.enabled = false;
        }
    }

    /**
     * Log an operation
     * @param {string} operation - Operation type (INSERT, UPDATE, DELETE)
     * @param {string} table - Table name
     * @param {Object} details - Operation details
     * @param {string} sessionId - Session/User ID
     */
    log(operation, table, details, sessionId = 'system') {
        if (!this.enabled || !this.stream) return;

        const record = {
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            operation: operation,
            table: table,
            details: details,
            hash: null
        };

        // Generate integrity hash
        const recordString = JSON.stringify({
            timestamp: record.timestamp,
            session_id: record.session_id,
            operation: record.operation,
            table: record.table,
            details: record.details
        });
        record.hash = crypto.createHash('sha256').update(recordString).digest('hex');

        // Write to audit log
        try {
            this.stream.write(JSON.stringify(record) + '\n');
        } catch (error) {
            console.error('Failed to write audit log:', error.message);
        }
    }

    /**
     * Log INSERT operation
     */
    logInsert(table, data, sessionId) {
        this.log('INSERT', table, { data }, sessionId);
    }

    /**
     * Log UPDATE operation
     */
    logUpdate(table, criteria, updates, affectedRows, sessionId) {
        this.log('UPDATE', table, {
            criteria: criteria,
            updates: updates,
            affected_rows: affectedRows
        }, sessionId);
    }

    /**
     * Log DELETE operation
     */
    logDelete(table, criteria, affectedRows, sessionId) {
        this.log('DELETE', table, {
            criteria: criteria,
            affected_rows: affectedRows
        }, sessionId);
    }

    /**
     * Close audit logger
     */
    close() {
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
    }

    /**
     * Write audit log header
     */
    _writeHeader() {
        const header = {
            type: 'AUDIT_LOG_HEADER',
            database: path.basename(this.dbPath),
            created_at: new Date().toISOString(),
            version: '1.0'
        };
        this.stream.write(JSON.stringify(header) + '\n');
    }

    /**
     * Read and verify audit log
     * @returns {Array} - Array of audit records
     */
    static readAuditLog(auditPath) {
        if (!fs.existsSync(auditPath)) {
            return [];
        }

        const content = fs.readFileSync(auditPath, 'utf-8');
        const lines = content.trim().split('\n');
        const records = [];

        for (const line of lines) {
            try {
                const record = JSON.parse(line);

                // Skip header
                if (record.type === 'AUDIT_LOG_HEADER') continue;

                // Verify hash
                const recordString = JSON.stringify({
                    timestamp: record.timestamp,
                    session_id: record.session_id,
                    operation: record.operation,
                    table: record.table,
                    details: record.details
                });
                const expectedHash = crypto.createHash('sha256').update(recordString).digest('hex');

                record.verified = (record.hash === expectedHash);
                records.push(record);
            } catch (e) {
                console.error('Failed to parse audit record:', e.message);
            }
        }

        return records;
    }
}

module.exports = AuditLogger;
