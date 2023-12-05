exports.verifyWebhook = (req, res) => {
    if (req.method === 'POST') {
      // Verifica si la solicitud contiene un campo "challenge".
      if (req.body && req.body.challenge) {
        // Si hay un campo "challenge", responde con el mismo valor.
        const challengeResponse = { challenge: req.body.challenge };
        res.status(200).json(challengeResponse);
      } else {
        // Procesa la solicitud del webhook como lo hacías antes.
        console.log("Datos recibidos:", req.body);
        res.status(200).send("Webhook recibido");
      }
    } else {
      // Manejar otros métodos HTTP si es necesario.
      res.status(405).send("Método no permitido");
    }
  };
  