const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const sql = neon(process.env.NETLIFY_DATABASE_URL);

        // Prendi i vecchi dati per confrontare le date
        const oldData = await sql`SELECT arrivo, partenza FROM partecipanti WHERE id = ${data.id}`;
        const dateChanged = oldData.length > 0 && 
            (oldData[0].arrivo !== data.arrivo || oldData[0].partenza !== data.partenza);

        // Aggiorna partecipante
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

        // Se le date sono cambiate, ricrea la tabella accessi
        if (dateChanged && data.arrivo && data.partenza) {
            // Cancella vecchi accessi
            await sql`DELETE FROM accessi WHERE id_partecipante = ${data.id}`;

            // Ricrea accessi per il nuovo periodo
            const arrivo = new Date(data.arrivo);
            const partenza = new Date(data.partenza);
            
            const accessiPromises = [];
            for (let d = new Date(arrivo); d <= partenza; d.setDate(d.getDate() + 1)) {
                const dataAccesso = d.toISOString().split('T')[0];
                accessiPromises.push(
                    sql`INSERT INTO accessi (id_partecipante, data_accesso_richiesto, status) 
                        VALUES (${data.id}, ${dataAccesso}, 0)`
                );
            }
            
            await Promise.all(accessiPromises);
        }

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