const { Pool } = require('pg');
// require('dotenv').config(); // Removed to prevent production env overwrite

const pool = new Pool({
    host: process.env.PG_HOST || '172.17.0.1',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'chatwoot',
    password: process.env.PG_PASSWORD || 'chatwoot_pass',
    database: process.env.PG_DATABASE || 'ty_identity',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/**
 * 事务封装
 * @param {Function} callback 
 */
const withTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};

module.exports = {
    query: (text, params) => pool.query(text, params),
    withTransaction,
    pool
};
