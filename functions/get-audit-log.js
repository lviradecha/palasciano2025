// netlify/functions/get-audit-log.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const { adminUserId } = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // Verifica che chi fa la richiesta sia ADMIN
        const [admin] = await sql`
            SELECT * FROM staff_users 
            WHERE id = ${adminUserId} 
            AND ruolo = 'ADMIN' 
            AND attivo = true
        `;

        if (!admin) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Accesso negato. Solo ADMIN può visualizzare l\'audit log.' 
                })
            };
        }

        // Recupera ultimi 500 eventi
        const logs = await sql`
            SELECT 
                id, user_id, username, nome_completo, 
                azione, entita, entita_id, dettagli, 
                ip_address, timestamp
            FROM audit_log
            ORDER BY timestamp DESC
            LIMIT 500
        `;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                logs: logs,
                total: logs.length
            })
        };

    } catch (error) {
        console.error('Errore get-audit-log:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};