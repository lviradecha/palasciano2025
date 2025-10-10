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

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // Data di oggi
        const today = new Date().toISOString().split('T')[0];

        // 1️⃣ STATISTICHE GENERALI
        const statsGenerali = await sql`
            SELECT 
                COUNT(*) as totale,
                COUNT(*) FILTER (WHERE status = 'preiscritto') as preiscritti,
                COUNT(*) FILTER (WHERE status = 'checkin') as checkin,
                COUNT(*) FILTER (WHERE status = 'accreditato') as accreditati,
                COUNT(*) FILTER (WHERE status = 'checkout') as checkout
            FROM partecipanti
        `;

        // 2️⃣ ARRIVI PREVISTI OGGI
        const arriviOggi = await sql`
            SELECT 
                COUNT(*) as previsti,
                COUNT(*) FILTER (WHERE status IN ('checkin', 'accreditato')) as arrivati
            FROM partecipanti
            WHERE arrivo = ${today}
        `;

        // 3️⃣ PRESENZE GIORNALIERE (ultimi 7 giorni + prossimi 3)
        const presenzeGiornaliere = await sql`
            SELECT 
                a.data_accesso_richiesto as data,
                COUNT(*) FILTER (WHERE a.status = 1) as presenti,
                COUNT(*) as previsti
            FROM accessi a
            WHERE a.data_accesso_richiesto >= CURRENT_DATE - INTERVAL '3 days'
              AND a.data_accesso_richiesto <= CURRENT_DATE + INTERVAL '3 days'
            GROUP BY a.data_accesso_richiesto
            ORDER BY a.data_accesso_richiesto
        `;

        // 4️⃣ PROVENIENZA PER REGIONE
        const perRegione = await sql`
            SELECT 
                regione,
                COUNT(*) as totale
            FROM partecipanti
            GROUP BY regione
            ORDER BY totale DESC
            LIMIT 10
        `;

        // 5️⃣ TIPO PARTECIPAZIONE
        const perTipo = await sql`
            SELECT 
                tipo_partecipazione,
                COUNT(*) as totale
            FROM partecipanti
            GROUP BY tipo_partecipazione
            ORDER BY totale DESC
        `;

        // 6️⃣ MODALITÀ VIAGGIO
        const perViaggio = await sql`
            SELECT 
                viaggio,
                COUNT(*) as totale
            FROM partecipanti
            WHERE viaggio IS NOT NULL
            GROUP BY viaggio
            ORDER BY totale DESC
        `;

        // 7️⃣ PRESENTI OGGI (check-in giornaliero)
        const presentiOggi = await sql`
            SELECT COUNT(*) as totale
            FROM accessi
            WHERE data_accesso_richiesto = ${today}
              AND status = 1
        `;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                stats: {
                    generali: statsGenerali[0],
                    arriviOggi: arriviOggi[0],
                    presentiOggi: presentiOggi[0].totale,
                    presenzeGiornaliere: presenzeGiornaliere,
                    perRegione: perRegione,
                    perTipo: perTipo,
                    perViaggio: perViaggio
                }
            })
        };

    } catch (error) {
        console.error('❌ Errore get-dashboard-stats:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};