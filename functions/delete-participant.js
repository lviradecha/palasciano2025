const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { id } = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // CASCADE cancella automaticamente anche le righe in accessi
        await sql`DELETE FROM partecipanti WHERE id = ${id}`;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error('Errore delete-participant:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};