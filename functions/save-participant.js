const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // Inserisci partecipante
        const result = await sql`
            INSERT INTO partecipanti (
                nome, cognome, cf, tel, email, tipo_partecipazione,
                comitato, regione, arrivo, partenza, viaggio, targa, veicolo,
                status, accreditamento, email_sent
            ) VALUES (
                ${data.nome}, ${data.cognome}, ${data.cf}, ${data.tel}, 
                ${data.email}, ${data.tipoPartecipazione || null},
                ${data.comitato}, ${data.regione}, ${data.arrivo}, ${data.partenza},
                ${data.viaggio}, ${data.targa || null}, ${data.veicolo || null},
                'preiscritto', 0, false
            ) RETURNING id
        `;

        const participantId = result[0].id;

        // Crea righe in accessi per ogni giorno tra arrivo e partenza
        const arrivo = new Date(data.arrivo);
        const partenza = new Date(data.partenza);
        
        const accessiPromises = [];
        for (let d = new Date(arrivo); d <= partenza; d.setDate(d.getDate() + 1)) {
            const dataAccesso = d.toISOString().split('T')[0];
            accessiPromises.push(
                sql`INSERT INTO accessi (id_partecipante, data_accesso_richiesto, status) 
                    VALUES (${participantId}, ${dataAccesso}, 0)`
            );
        }
        
        await Promise.all(accessiPromises);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, id: participantId })
        };
    } catch (error) {
        console.error('Errore save-participant:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};