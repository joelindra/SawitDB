/**
 * TriggerManager - Implements "Kentongan" (Village Alarm)
 * Automates actions on INSERT, UPDATE, DELETE events
 */
class TriggerManager {
    constructor(engine) {
        this.engine = engine;
        this.triggers = new Map(); // tableName -> array of triggers
    }

    /**
     * Initialize trigger system
     */
    init() {
        // Ensure _triggers system table exists
        const triggersEntry = this.engine.tableManager.findTableEntry('_triggers');
        if (!triggersEntry) {
            this.engine.tableManager.createTable('_triggers', true);
        }

        // Load existing triggers
        this._loadTriggers();
    }

    /**
     * Create a new trigger
     * @param {string} name - Trigger name
     * @param {string} timing - BEFORE or AFTER
     * @param {string} event - INSERT, UPDATE, or DELETE
     * @param {string} table - Table name
     * @param {string} action - Query to execute
     */
    createTrigger(name, timing, event, table, action) {
        // Validate timing
        if (!['BEFORE', 'AFTER'].includes(timing.toUpperCase())) {
            throw new Error(`Invalid trigger timing: ${timing}. Must be BEFORE or AFTER`);
        }

        // Validate event
        if (!['INSERT', 'UPDATE', 'DELETE'].includes(event.toUpperCase())) {
            throw new Error(`Invalid trigger event: ${event}. Must be INSERT, UPDATE, or DELETE`);
        }

        const trigger = {
            name: name,
            timing: timing.toUpperCase(),
            event: event.toUpperCase(),
            table: table,
            action: action,
            created_at: new Date().toISOString()
        };

        // Check if trigger already exists
        const existing = this.engine.selectExecutor.execute({
            type: 'SELECT',
            table: '_triggers',
            cols: ['*'],
            criteria: { key: 'name', op: '=', val: name }
        });

        if (existing && existing.length > 0) {
            throw new Error(`Trigger '${name}' already exists`);
        }

        // Store in _triggers system table
        this.engine.insertExecutor.execute({
            type: 'INSERT',
            table: '_triggers',
            data: trigger
        });

        // Add to in-memory map
        if (!this.triggers.has(table)) {
            this.triggers.set(table, []);
        }
        this.triggers.get(table).push(trigger);

        return `Trigger '${name}' created successfully`;
    }

    /**
     * Drop a trigger
     */
    dropTrigger(name) {
        const existing = this.engine.selectExecutor.execute({
            type: 'SELECT',
            table: '_triggers',
            cols: ['*'],
            criteria: { key: 'name', op: '=', val: name }
        });

        if (!existing || existing.length === 0) {
            throw new Error(`Trigger '${name}' not found`);
        }

        const trigger = existing[0];

        this.engine.deleteExecutor.execute({
            type: 'DELETE',
            table: '_triggers',
            criteria: { key: 'name', op: '=', val: name }
        });

        // Remove from in-memory map
        const tableTriggers = this.triggers.get(trigger.table);
        if (tableTriggers) {
            const idx = tableTriggers.findIndex(t => t.name === name);
            if (idx >= 0) {
                tableTriggers.splice(idx, 1);
            }
        }

        return `Trigger '${name}' dropped successfully`;
    }

    /**
     * Execute triggers for a specific event
     * @param {string} table - Table name
     * @param {string} event - Event type (INSERT, UPDATE, DELETE)
     * @param {string} timing - BEFORE or AFTER
     * @param {Object} context - Context data (old/new values)
     */
    executeTriggers(table, event, timing, context = {}) {
        const tableTriggers = this.triggers.get(table) || [];

        const matchingTriggers = tableTriggers.filter(t =>
            t.event === event.toUpperCase() &&
            t.timing === timing.toUpperCase()
        );

        for (const trigger of matchingTriggers) {
            try {
                // Parse and execute the trigger action
                // For now, we'll execute it as a simple query
                // In a full implementation, this would support variable substitution
                const command = this.engine.parser.parse(trigger.action);

                // Execute the command
                this.engine.query(trigger.action);
            } catch (error) {
                console.error(`Trigger '${trigger.name}' failed:`, error.message);
                // Depending on configuration, we might want to throw here
                // For now, we'll log and continue
            }
        }
    }

    /**
     * List all triggers
     */
    listTriggers(tableName = null) {
        try {
            const allTriggers = this.engine.selectExecutor.execute({
                type: 'SELECT',
                table: '_triggers',
                cols: ['*']
            });

            if (tableName) {
                return allTriggers.filter(t => t.table === tableName);
            }

            return allTriggers;
        } catch (e) {
            return [];
        }
    }

    /**
     * Load triggers from _triggers system table
     */
    _loadTriggers() {
        try {
            const triggersTable = this.engine.selectExecutor.execute({
                type: 'SELECT',
                table: '_triggers',
                cols: ['*']
            });

            if (triggersTable && Array.isArray(triggersTable)) {
                for (const trigger of triggersTable) {
                    if (!this.triggers.has(trigger.table)) {
                        this.triggers.set(trigger.table, []);
                    }
                    this.triggers.get(trigger.table).push(trigger);
                }
            }
        } catch (e) {
            // _triggers table might not exist yet, ignore
        }
    }
}

module.exports = TriggerManager;
