// functions/get-participants.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);

    // Recupera tutti i partecipanti - USA snake_case nel SELECT
    const participants = await sql`
      SELECT 
        id, nome, cognome, cf, tel, email, 
        tipopartecipazione, comitato, regione, 
        arrivo, partenza, viaggio, targa, veicolo, 
        status, email_sent,
        data_preiscrizione, data_checkin, data_accreditamento,
        created_at, updated_at
      FROM participants 
      ORDER BY created_at DESC
    `;

    // Converti i campi nel formato che si aspetta il frontend (camelCase)
    const formattedParticipants = participants.map(p => ({
      id: p.id,
      nome: p.nome,
      cognome: p.cognome,
      cf: p.cf,
      tel: p.tel,
      email: p.email,
      tipoPartecipazione: p.tipopartecipazione,
      comitato: p.comitato,
      regione: p.regione,
      arrivo: p.arrivo,
      partenza: p.partenza,
      viaggio: p.viaggio,
      targa: p.targa,
      veicolo: p.veicolo,
      status: p.status,
      emailSent: p.email_sent,
      dataPreiscrizione: p.data_preiscrizione,
      dataCheckin: p.data_checkin,
      dataAccreditamento: p.data_accreditamento,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    console.log('✅ Recuperati', formattedParticipants.length, 'partecipanti');

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        participants: formattedParticipants
      })
    };

  } catch (error) {
    console.error('❌ Errore recupero dati:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
