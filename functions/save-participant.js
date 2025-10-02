// functions/save-participant.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const data = JSON.parse(event.body);

    // Inserisci partecipante
    const result = await sql`
      INSERT INTO participants (
        id, nome, cognome, cf, tel, email, comitato, regione,
        arrivo, partenza, viaggio, targa, veicolo, status, email_sent
      ) VALUES (
        ${data.id}, ${data.nome}, ${data.cognome}, ${data.cf}, 
        ${data.tel}, ${data.email}, ${data.comitato}, ${data.regione},
        ${data.arrivo}, ${data.partenza}, ${data.viaggio}, 
        ${data.targa || null}, ${data.veicolo || null}, 
        ${data.status}, ${data.emailSent || false}
      )
      RETURNING *
    `;

    console.log('✅ Partecipante salvato:', data.email);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        participant: result[0]
      })
    };

  } catch (error) {
    console.error('❌ Errore salvataggio:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};