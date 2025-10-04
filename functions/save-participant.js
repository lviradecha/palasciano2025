// functions/save-participant.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    const data = JSON.parse(event.body);
    
    // Inserisci partecipante con TUTTI i campi della tabella
    const result = await sql`
      INSERT INTO participants (
        id, nome, cognome, cf, tel, email, 
        tipoPartecipazione, comitato, regione, 
        arrivo, partenza, viaggio, targa, veicolo, 
        status, emailSent, data_preiscrizione
      ) VALUES (
        ${data.id}, 
        ${data.nome}, 
        ${data.cognome}, 
        ${data.cf}, 
        ${data.tel}, 
        ${data.email}, 
        ${data.tipoPartecipazione || null},
        ${data.comitato}, 
        ${data.regione},
        ${data.arrivo || null}, 
        ${data.partenza || null}, 
        ${data.viaggio}, 
        ${data.targa || null}, 
        ${data.veicolo || null}, 
        ${data.status || 'preiscritto'}, 
        ${data.emailSent || false},
        ${new Date().toISOString()}
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
