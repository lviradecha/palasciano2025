// functions/update-participant.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'PUT' && event.httpMethod !== 'PATCH') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const data = JSON.parse(event.body);

    // Aggiorna partecipante
    const result = await sql`
      UPDATE participants 
      SET 
        nome = ${data.nome},
        cognome = ${data.cognome},
        cf = ${data.cf},
        tel = ${data.tel},
        email = ${data.email},
        comitato = ${data.comitato},
        regione = ${data.regione},
        arrivo = ${data.arrivo},
        partenza = ${data.partenza},
        viaggio = ${data.viaggio},
        targa = ${data.targa || null},
        veicolo = ${data.veicolo || null},
        status = ${data.status},
        email_sent = ${data.emailSent || false},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `;

    if (result.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: 'Partecipante non trovato'
        })
      };
    }

    console.log('✅ Partecipante aggiornato:', data.email);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        participant: result[0]
      })
    };

  } catch (error) {
    console.error('❌ Errore aggiornamento:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};