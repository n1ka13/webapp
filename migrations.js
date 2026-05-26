const mariadb = require('mariadb');

async function runMigrations(dbConfig) {
    const pool = mariadb.createPool({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        connectionLimit: 1
    });

    let conn;
    try {
        conn = await pool.getConnection();
        console.log("Running migrations...");
        
        await conn.query(`
            CREATE TABLE IF NOT EXISTS notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Migrations applied successfully!");
    } catch (err) {
        console.error("Migration error:", err);
        throw err;
    } finally {
        if (conn) conn.release();
        await pool.end();
    }
}

module.exports = { runMigrations };