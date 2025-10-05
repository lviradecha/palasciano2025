const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        await sql`
            UPDATE partecipanti SET
                nome = ${data.nome},
                cognome = ${data.cognome},
                cf = ${data.cf},
                tel = ${data.tel},
                email = ${data.email},
                tipo_partecipazione = ${data.tipoPartecipazione || null},
                comitato = ${data.comitato},
                regione = ${data.regione},
                arrivo = ${data.arrivo || null},
                partenza = ${data.partenza || null},
                viaggio = ${data.viaggio || null},
                targa = ${data.targa || null},
                veicolo = ${data.veicolo || null},
                status = ${data.status || 'preiscritto'},
                email_sent = ${data.emailSent || false}
            WHERE id = ${data.id}
        `;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error('Errore update-participant:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};