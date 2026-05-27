const express = require('express');
const mariadb = require('mariadb');
const parseArgs = require('minimist');
const { runMigrations } = require('./migrations');

const args = parseArgs(process.argv.slice(2), {
    default: {
        port: 8080
    }
});

const dbConfig = {
    host: process.env.DB_HOST || args['db-host'] || '127.0.0.1',
    user: process.env.DB_USER || args['db-user'] || 'webapp_user',
    password: process.env.DB_PASSWORD || args['db-pass'] || 'password',
    database: process.env.DB_NAME || args['db-name'] || 'mywebapp_db'
};
const PORT = process.env.PORT || args.port;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = mariadb.createPool({
    ...dbConfig,
    connectionLimit: 5
});

function renderHtmlTable(title, headers, rows) {
    let html = `<!DOCTYPE html><html><head><title>${title}</title></head><body>`;
    html += `<h1>${title}</h1>`;
    html += `<table border="1"><tr>`;
    headers.forEach(h => html += `<th>${h}</th>`);
    html += `</tr>`;
    rows.forEach(row => {
        html += `<tr>`;
        row.forEach(cell => html += `<td>${cell}</td>`);
        html += `</tr>`;
    });
    html += `</table></body></html>`;
    return html;
}

app.get('/health/alive', (req, res) => {
    res.status(200).send('OK');
});

app.get('/health/ready', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('SELECT 1');
        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send(`Database connection failed: ${err.message}`);
    } finally {
        if (conn) conn.release();
    }
});

app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>My Web App</title></head>
    <body>
        <h1>Welcome to Notes Service</h1>
        <p>Available endpoints:</p>
        <ul>
            <li>GET /notes - List all notes</li>
            <li>POST /notes - Create a note</li>
            <li>GET /notes/&lt;id&gt; - Get full note</li>
        </ul>
    </body>
    </html>`;
    res.set('Content-Type', 'text/html');
    res.send(html);
});

app.get('/notes', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT id, title FROM notes');
        
        // Перевірка заголовка Accept
        const accept = req.headers['accept'] || '';
        if (accept.includes('text/html')) {
            const tableRows = rows.map(r => [r.id, r.title]);
            res.set('Content-Type', 'text/html');
            return res.send(renderHtmlTable('Notes List', ['ID', 'Title'], tableRows));
        } else {
            return res.json(rows);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/notes', async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).send('Missing title or content');
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query('INSERT INTO notes (title, content) VALUES (?, ?)', [title, content]);
        
        res.status(201).json({ id: Number(result.insertId), title, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/notes/:id', async (req, res) => {
    const id = req.params.id;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT id, title, content, created_at FROM notes WHERE id = ?', [id]);
        
        if (rows.length === 0) {
            return res.status(404).send('Note not found');
        }
        
        const note = rows[0];
        const accept = req.headers['accept'] || '';
        
        if (accept.includes('text/html')) {
            const html = `
            <!DOCTYPE html>
            <html>
            <head><title>${note.title}</title></head>
            <body>
                <h1>${note.title}</h1>
                <p><strong>ID:</strong> ${note.id}</p>
                <p><strong>Created At:</strong> ${note.created_at}</p>
                <p><strong>Content:</strong></p>
                <p>${note.content}</p>
            </body>
            </html>`;
            res.set('Content-Type', 'text/html');
            return res.send(html);
        } else {
            return res.json(note);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

async function start() {
const socketActivation = process.env.LISTEN_FDS > 0;
const listenConfig = socketActivation ? { fd: 3 } : PORT;
    try {
        await runMigrations(dbConfig);
        app.listen(listenConfig, () => {
        if(socketActivation) {
            console.log(`Server running with systemd socket activation`);
        } else {
            console.log(`Server running on http://127.0.0.1:${PORT}`);
        }
        });
    } catch (err) {
        console.error("Failed to start application:", err);
        process.exit(1);
    }
}

if (require.main === module) {
    start();
}

module.exports = { app, pool };