const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const sql = neon(process.env.NETLIFY_DATABASE_URL);
        
        const participants = await sql`
            SELECT 
                p.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', a.id,
                            'data', a.data_accesso_richiesto,
                            'status', a.status,
                            'dataCheckin', a.data_checkin
                        ) ORDER BY a.data_accesso_richiesto
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'::json
                ) as accessi
            FROM partecipanti p
            LEFT JOIN accessi a ON p.id = a.id_partecipante
            GROUP BY p.id
            ORDER BY p.data_preiscrizione DESC
        `;

        // Mappa i risultati nel formato del frontend
        const formatted = participants.map(p => ({
            id: p.id,
            nome: p.nome,
            cognome: p.cognome,
            cf: p.cf,
            tel: p.tel,
            email: p.email,
            tipoPartecipazione: p.tipo_partecipazione,
            comitato: p.comitato,
            regione: p.regione,
            arrivo: p.arrivo,
            partenza: p.partenza,
            viaggio: p.viaggio,
            targa: p.targa,
            veicolo: p.veicolo,
            status: p.status,
            accreditamento: p.accreditamento,
            emailSent: p.email_sent,
            dataPreiscrizione: p.data_preiscrizione,
            dataAccreditamento: p.data_accreditamento,
            dataCheckout: p.data_checkout,
            accessi: Array.isArray(p.accessi) ? p.accessi.filter(a => a.id !== null) : []
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, participants: formatted })
        };
    } catch (error) {
        console.error('Errore get-participants:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};