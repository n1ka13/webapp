const request = require('supertest');

jest.mock('mariadb', () => {
    const mockConn = {
        query: jest.fn(),
        release: jest.fn(),
    };
    return {
        createPool: jest.fn(() => ({
            getConnection: jest.fn().mockResolvedValue(mockConn),
        })),
    };
});

jest.mock('../migrations', () => ({
    runMigrations: jest.fn().mockResolvedValue(true),
}));

const { app, pool } = require('../server');

describe('Тестування HTTP Endpoints (My Web App)', () => {
    let mockConn;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockConn = await pool.getConnection();
    });

    test('GET /health/alive має повертати 200 OK', async () => {
        const res = await request(app).get('/health/alive');
        expect(res.statusCode).toEqual(200);
        expect(res.text).toEqual('OK');
    });

    test('GET /health/ready має повертати 200 OK, якщо БД доступна', async () => {
        mockConn.query.mockResolvedValue([{ '1': 1 }]);

        const res = await request(app).get('/health/ready');
        expect(res.statusCode).toEqual(200);
        expect(res.text).toEqual('OK');
    });

    test('GET /health/ready має повертати 500, якщо підключення до БД збійне', async () => {
        mockConn.query.mockRejectedValue(new Error('Сбій мережі БД'));

        const res = await request(app).get('/health/ready');
        expect(res.statusCode).toEqual(500);
        expect(res.text).toContain('Database connection failed');
    });

    test('GET / має повертати головну HTML-сторінку сервісу нотаток', async () => {
        const res = await request(app).get('/');
        expect(res.statusCode).toEqual(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toContain('Welcome to Notes Service');
    });

    test('GET /notes має повертати масив JSON за замовчуванням', async () => {
        const fakeNotes = [
            { id: 1, title: 'Перша нотатка' },
            { id: 2, title: 'Друга нотатка' }
        ];
        mockConn.query.mockResolvedValue(fakeNotes);

        const res = await request(app).get('/notes');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toEqual(fakeNotes);
    });

    test('GET /notes має повертати HTML таблицю, якщо заголовок Accept містить text/html', async () => {
        const fakeNotes = [{ id: 1, title: 'Тестова HTML Нотатка' }];
        mockConn.query.mockResolvedValue(fakeNotes);

        const res = await request(app)
            .get('/notes')
            .set('Accept', 'text/html');

        expect(res.statusCode).toEqual(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toContain('<table border="1">');
        expect(res.text).toContain('Notes List');
    });

    test('POST /notes має повертати 400, якщо відсутні title або content', async () => {
        const res = await request(app)
            .post('/notes')
            .send({ title: 'Тільки заголовок' });

        expect(res.statusCode).toEqual(400);
        expect(res.text).toEqual('Missing title or content');
    });

    test('POST /notes має успішно створювати нотатку та повертати 210 JSON', async () => {
        mockConn.query.mockResolvedValue({ insertId: 42 });

        const res = await request(app)
            .post('/notes')
            .send({ title: 'Нова нотатка', content: 'Зміст нотатки' });

        expect(res.statusCode).toEqual(201);
        expect(res.body).toEqual({ id: 42, title: 'Нова нотатка', content: 'Зміст нотатки' });
    });
});