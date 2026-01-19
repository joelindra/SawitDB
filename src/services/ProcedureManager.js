/**
 * ProcedureManager - Implements "SOP" (Standard Operating Procedures)
 * Stores and executes reusable query sequences
 */
class ProcedureManager {
    constructor(engine) {
        this.engine = engine;
        this.procedures = new Map(); // procedureName -> procedure definition
    }

    /**
     * Initialize procedure system
     */
    init() {
        // Ensure _procedures system table exists
        const proceduresEntry = this.engine.tableManager.findTableEntry('_procedures');
        if (!proceduresEntry) {
            this.engine.tableManager.createTable('_procedures', true);
        }

        // Load existing procedures
        this._loadProcedures();
    }

    /**
     * Create a new stored procedure
     * @param {string} name - Procedure name
     * @param {Array} params - Parameter names (e.g., ['@param1', '@param2'])
     * @param {string} body - Query or query sequence
     */
    createProcedure(name, params, body) {
        const procedure = {
            name: name,
            params: JSON.stringify(params || []),
            body: body,
            created_at: new Date().toISOString()
        };

        // Check if procedure already exists
        const existing = this.engine.selectExecutor.execute({
            type: 'SELECT',
            table: '_procedures',
            cols: ['*'],
            criteria: { key: 'name', op: '=', val: name }
        });

        if (existing && existing.length > 0) {
            throw new Error(`Procedure '${name}' already exists`);
        }

        // Store in _procedures system table
        this.engine.insertExecutor.execute({
            type: 'INSERT',
            table: '_procedures',
            data: procedure
        });

        // Add to in-memory map
        this.procedures.set(name, {
            name,
            params: params || [],
            body
        });

        return `Procedure '${name}' created successfully`;
    }

    /**
     * Execute a stored procedure
     * @param {string} name - Procedure name
     * @param {Array} args - Argument values
     */
    executeProcedure(name, args = []) {
        const procedure = this.procedures.get(name);

        if (!procedure) {
            throw new Error(`Procedure '${name}' not found`);
        }

        // Validate argument count
        if (args.length !== procedure.params.length) {
            throw new Error(`Procedure '${name}' expects ${procedure.params.length} arguments, got ${args.length}`);
        }

        // Build parameter map
        const paramMap = {};
        for (let i = 0; i < procedure.params.length; i++) {
            const paramName = procedure.params[i].replace('@', '');
            paramMap[paramName] = args[i];
        }

        // Execute the procedure body with parameters
        try {
            // Split body into multiple queries if separated by semicolon
            const queries = procedure.body.split(';').filter(q => q.trim());
            const results = [];

            for (const query of queries) {
                const command = this.engine.parser.parse(query.trim(), paramMap);
                const result = this.engine.query(query.trim());
                results.push(result);
            }

            return results.length === 1 ? results[0] : results;
        } catch (error) {
            throw new Error(`Procedure '${name}' execution failed: ${error.message}`);
        }
    }

    /**
     * Drop a stored procedure
     */
    dropProcedure(name) {
        const existing = this.engine.selectExecutor.execute({
            type: 'SELECT',
            table: '_procedures',
            cols: ['*'],
            criteria: { key: 'name', op: '=', val: name }
        });

        if (!existing || existing.length === 0) {
            throw new Error(`Procedure '${name}' not found`);
        }

        this.engine.deleteExecutor.execute({
            type: 'DELETE',
            table: '_procedures',
            criteria: { key: 'name', op: '=', val: name }
        });

        this.procedures.delete(name);

        return `Procedure '${name}' dropped successfully`;
    }

    /**
     * List all procedures
     */
    listProcedures() {
        try {
            return this.engine.selectExecutor.execute({
                type: 'SELECT',
                table: '_procedures',
                cols: ['*']
            }) || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Load procedures from _procedures system table
     */
    _loadProcedures() {
        try {
            const proceduresTable = this.engine.selectExecutor.execute({
                type: 'SELECT',
                table: '_procedures',
                cols: ['*']
            });

            if (proceduresTable && Array.isArray(proceduresTable)) {
                for (const procedure of proceduresTable) {
                    this.procedures.set(procedure.name, {
                        name: procedure.name,
                        params: JSON.parse(procedure.params),
                        body: procedure.body
                    });
                }
            }
        } catch (e) {
            // _procedures table might not exist yet, ignore
        }
    }
}

module.exports = ProcedureManager;
