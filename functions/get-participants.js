const { neon } = require('@neondatabase/serverless');
const zlib = require('zlib');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const sql = neon(process.env.NETLIFY_DATABASE_URL);
        await sql`SET TIME ZONE 'Europe/Rome'`;

        // ✅ Query ottimizzata con JOIN - una sola chiamata al DB
        const participants = await sql`
            SELECT 
                p.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'data', a.data_accesso_richiesto,
                            'status', a.status,
                            'dataCheckin', a.data_checkin,
                            'dataCheckout', a.data_checkout
                        ) ORDER BY a.data_accesso_richiesto DESC
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'::json
                ) as accessi
            FROM partecipanti p
            LEFT JOIN accessi a ON a.id_partecipante = p.id
            GROUP BY p.id
            ORDER BY p.cognome, p.nome
        `;

        const responseBody = JSON.stringify({
            success: true,
            participants: participants,
            timestamp: new Date().toISOString()
        });

        // ✅ Comprimi con gzip se il client lo supporta
        const acceptEncoding = event.headers['accept-encoding'] || '';
        
        if (acceptEncoding.includes('gzip')) {
            const compressed = zlib.gzipSync(responseBody);
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Encoding': 'gzip'
                },
                body: compressed.toString('base64'),
                isBase64Encoded: true
            };
        }

        return {
            statusCode: 200,
            headers,
            body: responseBody
        };

    } catch (error) {
        console.error('❌ Errore get-participants:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};