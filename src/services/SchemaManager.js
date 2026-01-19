/**
 * SchemaManager - Manages table schemas and data type validation
 * Implements "Sertifikasi Lahan" (Land Certification) for SawitDB
 */
class SchemaManager {
    constructor(engine) {
        this.engine = engine;
        this.schemas = new Map(); // tableName -> schema definition
    }

    /**
     * Initialize schema storage (called on engine startup)
     */
    init() {
        // Ensure _schemas system table exists
        const schemasEntry = this.engine.tableManager.findTableEntry('_schemas');
        if (!schemasEntry) {
            this.engine.tableManager.createTable('_schemas', true);
        }

        // Load existing schemas into memory
        this._loadSchemas();
    }

    /**
     * Define a schema for a table
     * @param {string} tableName - Name of the table
     * @param {Object} schemaDefinition - Schema definition
     * Example: { name: { type: 'TEKS', required: true }, age: { type: 'ANGKA', default: 0 } }
     */
    defineSchema(tableName, schemaDefinition) {
        // Validate schema definition
        for (const [field, config] of Object.entries(schemaDefinition)) {
            if (!this._isValidType(config.type)) {
                throw new Error(`Invalid type '${config.type}' for field '${field}'`);
            }
        }

        // Store in memory
        this.schemas.set(tableName, schemaDefinition);

        // Persist to _schemas system table
        const schemaRecord = {
            table: tableName,
            definition: JSON.stringify(schemaDefinition),
            created_at: new Date().toISOString()
        };

        // Check if schema already exists
        const existing = this.engine.selectExecutor.execute({
            type: 'SELECT',
            table: '_schemas',
            cols: ['*'],
            criteria: { key: 'table', op: '=', val: tableName }
        });

        if (existing && existing.length > 0) {
            // Update existing
            this.engine.updateExecutor.execute({
                type: 'UPDATE',
                table: '_schemas',
                updates: {
                    definition: JSON.stringify(schemaDefinition),
                    created_at: new Date().toISOString()
                },
                criteria: { key: 'table', op: '=', val: tableName }
            });
        } else {
            // Insert new
            this.engine.insertExecutor.execute({
                type: 'INSERT',
                table: '_schemas',
                data: schemaRecord
            });
        }

        return `Schema defined for table '${tableName}'`;
    }

    /**
     * Get schema for a table
     */
    getSchema(tableName) {
        return this.schemas.get(tableName) || null;
    }

    /**
     * Validate data against table schema
     * @param {string} tableName - Name of the table
     * @param {Object} data - Data to validate
     * @returns {Object} - Validated and coerced data
     */
    validateData(tableName, data) {
        const schema = this.schemas.get(tableName);

        // If no schema defined, allow any data (backward compatibility)
        if (!schema) {
            return data;
        }

        const validatedData = {};

        // Check all schema fields
        for (const [field, config] of Object.entries(schema)) {
            const value = data[field];

            // Check required fields
            if (config.required && (value === undefined || value === null)) {
                throw new Error(`Field '${field}' is required but missing`);
            }

            // Apply default values
            if (value === undefined && config.default !== undefined) {
                validatedData[field] = config.default;
                continue;
            }

            // Skip validation if value is null and field is optional
            if (value === null && !config.required) {
                validatedData[field] = null;
                continue;
            }

            // Validate and coerce type
            if (value !== undefined && value !== null) {
                validatedData[field] = this._validateType(field, value, config.type);
            }
        }

        // Allow extra fields not in schema (for flexibility)
        for (const [field, value] of Object.entries(data)) {
            if (!schema[field]) {
                validatedData[field] = value;
            }
        }

        return validatedData;
    }

    /**
     * Drop schema for a table
     */
    dropSchema(tableName) {
        this.schemas.delete(tableName);

        this.engine.deleteExecutor.execute({
            type: 'DELETE',
            table: '_schemas',
            criteria: { key: 'table', op: '=', val: tableName }
        });
    }

    /**
     * Load schemas from _schemas system table
     */
    _loadSchemas() {
        try {
            const schemasTable = this.engine.selectExecutor.execute({
                type: 'SELECT',
                table: '_schemas',
                cols: ['*']
            });

            if (schemasTable && Array.isArray(schemasTable)) {
                for (const record of schemasTable) {
                    try {
                        const definition = JSON.parse(record.definition);
                        this.schemas.set(record.table, definition);
                    } catch (e) {
                        console.error(`Failed to load schema for table '${record.table}':`, e.message);
                    }
                }
            }
        } catch (e) {
            // _schemas table might not exist yet, ignore
        }
    }

    /**
     * Check if a type is valid
     */
    _isValidType(type) {
        const validTypes = ['TEKS', 'ANGKA', 'TANGGAL', 'BENAR_SALAH', 'STRING', 'NUMBER', 'DATE', 'BOOLEAN'];
        return validTypes.includes(type.toUpperCase());
    }

    /**
     * Validate and coerce a value to the specified type
     */
    _validateType(field, value, type) {
        const upperType = type.toUpperCase();

        switch (upperType) {
            case 'TEKS':
            case 'STRING':
                if (typeof value !== 'string') {
                    throw new Error(`Field '${field}' must be a string, got ${typeof value}`);
                }
                return value;

            case 'ANGKA':
            case 'NUMBER':
                const num = Number(value);
                if (isNaN(num)) {
                    throw new Error(`Field '${field}' must be a number, got '${value}'`);
                }
                return num;

            case 'TANGGAL':
            case 'DATE':
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    throw new Error(`Field '${field}' must be a valid date, got '${value}'`);
                }
                return date.toISOString();

            case 'BENAR_SALAH':
            case 'BOOLEAN':
                if (typeof value === 'boolean') {
                    return value;
                }
                if (value === 'true' || value === 1) return true;
                if (value === 'false' || value === 0) return false;
                throw new Error(`Field '${field}' must be a boolean, got '${value}'`);

            default:
                throw new Error(`Unknown type '${type}' for field '${field}'`);
        }
    }
}

module.exports = SchemaManager;
